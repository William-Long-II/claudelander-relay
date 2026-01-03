import {
  Controller,
  Post,
  Get,
  Req,
  Headers,
  UseGuards,
  RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import { User } from '../entities/user.entity';

@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  createCheckout(@Req() req: { user: User }) {
    return this.billingService.createCheckoutSession(req.user);
  }

  @Get('portal')
  @UseGuards(JwtAuthGuard)
  createPortal(@Req() req: { user: User }) {
    return this.billingService.createPortalSession(req.user);
  }

  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    await this.billingService.handleWebhook(req.rawBody!, signature);
    return { received: true };
  }
}
