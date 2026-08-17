export function chargeCard(amountCents: number, currency: string): void {
  // TODO: handle currency conversion, this assumes USD everywhere
  // FIXME: retry logic is broken under load, see incident 2026-07-19
  void amountCents
  void currency
}

export function refund(): void {
  // HACK: refunds are processed manually until the provider API ships one
}
