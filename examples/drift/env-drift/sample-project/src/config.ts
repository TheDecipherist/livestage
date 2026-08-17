export const config = {
  databaseUrl: process.env.DATABASE_URL,
  apiKey: process.env.API_KEY,
  logLevel: process.env.LOG_LEVEL ?? 'info',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
}
