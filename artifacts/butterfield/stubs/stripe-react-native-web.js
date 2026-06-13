/**
 * Web stub for @stripe/stripe-react-native
 * Stripe payments are native-only; this prevents the web bundle from crashing.
 * These no-op exports allow screens that import the package to render on web
 * without crashing (the payment UI itself is iOS/Android only).
 */
const React = require('react');

const noop = () => {};
const noopAsync = async () => ({});

const StripeProvider = ({ children }) => children;

const CardField = () => null;

const CardForm = () => null;

const useStripe = () => ({
  confirmPayment: noopAsync,
  createPaymentMethod: noopAsync,
  handleNextAction: noopAsync,
  initPaymentSheet: noopAsync,
  presentPaymentSheet: noopAsync,
  retrievePaymentIntent: noopAsync,
  retrieveSetupIntent: noopAsync,
  confirmSetupIntent: noopAsync,
  createToken: noopAsync,
  collectBankAccountForPayment: noopAsync,
});

const usePlatformPay = () => ({
  isPlatformPaySupported: async () => false,
  confirmPlatformPayPayment: noopAsync,
});

const PlatformPay = {
  ButtonType: {
    Buy: 'Buy',
    Donate: 'Donate',
    Plain: 'Plain',
    Book: 'Book',
    Checkout: 'Checkout',
    Subscribe: 'Subscribe',
    Reload: 'Reload',
    AddMoney: 'AddMoney',
    TopUp: 'TopUp',
    Order: 'Order',
    Rent: 'Rent',
    Support: 'Support',
    Contribute: 'Contribute',
    Tip: 'Tip',
    Continue: 'Continue',
    Setup: 'Setup',
    InStore: 'InStore',
  },
};

const PlatformPayButton = () => null;

module.exports = {
  StripeProvider,
  CardField,
  CardForm,
  useStripe,
  usePlatformPay,
  PlatformPay,
  PlatformPayButton,
};
