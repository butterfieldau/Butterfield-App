const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const interopHeader = path.join(
  repoRoot,
  "node_modules",
  "@stripe",
  "stripe-react-native",
  "ios",
  "StripeSwiftInterop.h"
);

const fromLine = "typedef NS_ENUM(NSUInteger, STPPaymentStatus);";
const toLine = "typedef NS_ENUM(NSInteger, STPPaymentStatus);";

if (!fs.existsSync(interopHeader)) {
  console.log("[patch-stripe-ios] Stripe iOS header not found, skipping.");
  process.exit(0);
}

const source = fs.readFileSync(interopHeader, "utf8");

if (source.includes(toLine)) {
  console.log("[patch-stripe-ios] Stripe iOS header already patched.");
  process.exit(0);
}

if (!source.includes(fromLine)) {
  console.warn("[patch-stripe-ios] Expected Stripe enum declaration not found.");
  process.exit(0);
}

fs.writeFileSync(interopHeader, source.replace(fromLine, toLine));
console.log("[patch-stripe-ios] Patched STPPaymentStatus enum backing type.");
