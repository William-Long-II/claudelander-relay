import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { User } from '../entities/user.entity';

@Injectable()
export class BillingService {
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {
    this.stripe = new Stripe(this.configService.get<string>('stripe.secretKey')!);
  }

  async createCheckoutSession(user: User): Promise<{ url: string }> {
    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await this.usersRepository.save(user);
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: user.id,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: this.configService.get('stripe.priceId'),
          quantity: 1,
        },
      ],
      success_url: `${this.configService.get('app.frontendUrl')}billing/success`,
      cancel_url: `${this.configService.get('app.frontendUrl')}billing/cancel`,
    });

    return { url: session.url! };
  }

  async createPortalSession(user: User): Promise<{ url: string }> {
    if (!user.stripeCustomerId) {
      throw new Error('No Stripe customer found');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${this.configService.get('app.frontendUrl')}settings`,
    });

    return { url: session.url };
  }

  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    const webhookSecret = this.configService.get('stripe.webhookSecret');
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret!,
      );
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.client_reference_id) {
          await this.upgradeUser(session.client_reference_id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.downgradeByCustomerId(subscription.customer as string);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        if (
          subscription.status === 'canceled' ||
          subscription.status === 'unpaid'
        ) {
          await this.downgradeByCustomerId(subscription.customer as string);
        }
        break;
      }
    }
  }

  private async upgradeUser(userId: string): Promise<void> {
    await this.usersRepository.update(userId, { tier: 'pro' });
  }

  private async downgradeByCustomerId(customerId: string): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { stripeCustomerId: customerId },
    });
    if (user && user.tier !== 'admin') {
      user.tier = 'free';
      await this.usersRepository.save(user);
    }
  }
}
