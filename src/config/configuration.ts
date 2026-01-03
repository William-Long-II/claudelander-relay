export default () => ({
  database: {
    url: process.env.DATABASE_URL,
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl: process.env.GITHUB_CALLBACK_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    priceId: process.env.STRIPE_PRICE_ID,
  },
  app: {
    url: process.env.APP_URL,
    frontendUrl: process.env.FRONTEND_URL,
  },
});
