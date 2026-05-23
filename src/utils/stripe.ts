import Stripe from "stripe";

export function getStripe() {
  const client = new Stripe(
    "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",
    { httpClient: Stripe.createFetchHttpClient() }
  );

  return client;
}
