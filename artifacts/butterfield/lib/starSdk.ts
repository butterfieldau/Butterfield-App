/**
 * Star Micronics StarXpand SDK wrapper — Star MCP30 / mC-Print3 (Ethernet).
 *
 * Uses react-native-star-io10 v1.12.1+ which is tested against iOS 26 / Xcode 26.4.
 * Dynamic imports ensure the native module is never evaluated at screen load —
 * only when a print or drawer action is actually triggered.
 *
 * Epson printers use a separate raw TCP path (lib/printer.ts). This file is
 * Star-only and should not be imported for Epson jobs.
 */

async function getStarApi() {
  return import('react-native-star-io10');
}

async function openStarPrinter(ip: string) {
  const { StarPrinter, StarConnectionSettings, InterfaceType } = await getStarApi();
  const settings = new StarConnectionSettings();
  settings.interfaceType = InterfaceType.Lan;
  settings.identifier = ip;
  const printer = new StarPrinter(settings);
  await printer.open();
  return printer;
}

/**
 * Open the cash drawer connected to a Star MCP30/mC-Print3 over Ethernet.
 *
 * Uses the StarXpand CommandBuilder which correctly encodes the drawer pulse
 * for Star firmware — more reliable than sending raw DLE DC4 bytes via a raw
 * TCP socket (which can be blocked by iOS local network permission gates or
 * silently dropped when a prior TCP session is still in teardown).
 *
 * drawerPin: 0 = Drawer port 1 (No1), 1 = Drawer port 2 (No2).
 */
export async function starOpenDrawer(ip: string, drawerPin: 0 | 1 = 0): Promise<void> {
  const { StarXpandCommand } = await getStarApi();
  const printer = await openStarPrinter(ip);
  try {
    const channel =
      drawerPin === 0
        ? StarXpandCommand.Drawer.Channel.No1
        : StarXpandCommand.Drawer.Channel.No2;

    const builder = new StarXpandCommand.StarXpandCommandBuilder();
    builder.addDocument(
      new StarXpandCommand.DocumentBuilder().addDrawer(
        new StarXpandCommand.DrawerBuilder().actionOpen(
          new StarXpandCommand.Drawer.OpenParameter().setChannel(channel),
        ),
      ),
    );

    const commands = await builder.getCommands();
    await printer.print(commands);
  } finally {
    try { await printer.close(); } catch { /* best-effort */ }
  }
}

/**
 * Send raw ESC/POS bytes to a Star printer using the SDK's printRawData.
 *
 * The API server builds ESC/POS bytes (branded for Star — correct paper feed,
 * cut command, and drawer pulse). We send them via the SDK's iOS-native TCP
 * transport which handles connection lifecycle and data flushing reliably.
 */
export async function starDirectSend(ip: string, bytes: Uint8Array): Promise<void> {
  const printer = await openStarPrinter(ip);
  try {
    await printer.printRawData(Array.from(bytes));
  } finally {
    try { await printer.close(); } catch { /* best-effort */ }
  }
}
