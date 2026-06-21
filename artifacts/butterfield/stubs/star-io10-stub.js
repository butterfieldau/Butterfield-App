/**
 * Consumer-build stub for react-native-star-io10
 *
 * StarIO10 is a POS/Shop Display hardware module with no role in the consumer
 * binary. On iOS 26 / arm64e its TurboModule eager-init throws a SIGABRT crash.
 * This stub replaces the module for all non-POS builds (IS_POS_BUILD !== '1').
 *
 * All exports mirror the real module surface so TypeScript and bundler are happy,
 * but every call is a safe no-op. lib/printer.ts already wraps Star SDK calls
 * in try/catch and surfaces a "hardware unavailable" message when they fail.
 */

const unavailable = () => {
  throw new Error(
    'Star printer hardware is not available in this build. ' +
    'Printer features require the POS build (IS_POS_BUILD=1).'
  );
};

const unavailableAsync = async () => {
  throw new Error(
    'Star printer hardware is not available in this build. ' +
    'Printer features require the POS build (IS_POS_BUILD=1).'
  );
};

class StarPrinter {
  constructor() {}
  async open() { await unavailableAsync(); }
  async print() { await unavailableAsync(); }
  async close() {}
  async dispose() {}
}

class StarConnectionSettings {
  constructor() {
    this.interfaceType = null;
    this.identifier = '';
    this.autoSwitchInterface = false;
  }
}

const InterfaceType = {
  Lan: 'Lan',
  LAN: 'LAN',
  Bluetooth: 'Bluetooth',
  BluetoothLE: 'BluetoothLE',
  Usb: 'Usb',
};

class _NoopBuilder {
  constructor() {}
  addDocument() { return this; }
  addDrawer() { return this; }
  actionOpen() { return this; }
  setChannel() { return this; }
  async getCommands() { return []; }
}

const StarXpandCommand = {
  StarXpandCommandBuilder: _NoopBuilder,
  DocumentBuilder: _NoopBuilder,
  DrawerBuilder: _NoopBuilder,
  Drawer: {
    OpenParameter: _NoopBuilder,
    Channel: {
      One: 0,
      No1: 0,
      Channel1: 0,
      Two: 1,
      No2: 1,
      Channel2: 1,
    },
  },
};

module.exports = {
  StarPrinter,
  StarConnectionSettings,
  InterfaceType,
  StarXpandCommand,
};
