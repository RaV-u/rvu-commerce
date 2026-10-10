// Secure policy boundary. No runtime/client-selectable vulnerability controls.
export const baseline = Object.freeze({
  profile: "secure-baseline",
  version: 1,
  openingCredit: 15000,
  currency: "EGP",
  maxQuantity: 10,
});
export const activeTrainingProfiles = ["secure-baseline", "B01", "B04", "B08", "B10", "R01", "B02", "B03", "B05", "B06", "B07", "B09", "B11", "B12", "R02", "R03", "R04", "R05", "R06", "open-playground"] as const;
export type TrainingProfile = (typeof activeTrainingProfiles)[number];
export const plannedCore = Object.freeze(["B01", "B04", "B08", "B10", "R01"]);
export const productWorkflows = Object.freeze({
  clientPrice:"form-75", signedAdjustment:"arc-light", promotionalStack:"hush-pro",
  bulkOrder:"vista-27", voucherRace:"bridge-8", checkoutRace:"lift-stand",
  paymentProof:"field-pack", giftCredit:"gift-500",
});
export const focusedCart=(items:{id:string}[],sku:string):boolean =>
  items.length===1 && items[0].id===sku;
export function totalFor(
  items: { price: string | number; quantity: number; kind: string }[],
  promotion?: { percent: number; minimum: string | number },
  options: { giftEligible?: boolean; stackedDiscount?: number } = {},
) {
  const subtotal = items.reduce(
    (sum, p) => sum + Number(p.price) * p.quantity,
    0,
  );
  const eligible = items
    .filter((p) => options.giftEligible || p.kind === "physical")
    .reduce((sum, p) => sum + Number(p.price) * p.quantity, 0);
  const calculated =
    promotion && eligible >= Number(promotion.minimum)
      ? Math.floor((eligible * promotion.percent) / 100)
      : 0;
  const discount = options.stackedDiscount ?? calculated;
  return {
    subtotal,
    discount,
    total: subtotal - discount,
    eligible,
    couponEligible: (!promotion || calculated > 0) && subtotal > discount,
  };
}

export function hasWeakness(profile:string, scenario:string):boolean {
  return profile === "open-playground" || profile === scenario;
}

// Two stable classroom customers share one local storefront but retain
// separate identities, baskets, wallets, sessions, inboxes and order history.
export type ClassroomUsername = "rvu" | "rvu_2";
export const classroomAccountEmail = (username:ClassroomUsername):string =>
  username+"@learner.rvu.test";
export const classroomUsername = (email:string):ClassroomUsername | undefined =>
  email===classroomAccountEmail("rvu") ? "rvu" :
  email===classroomAccountEmail("rvu_2") ? "rvu_2" : undefined;
export const classroomColleagueEmail = (email:string):string | undefined =>
  email===classroomAccountEmail("rvu") ? classroomAccountEmail("rvu_2") :
  email===classroomAccountEmail("rvu_2") ? classroomAccountEmail("rvu") : undefined;
