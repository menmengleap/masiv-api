import QRCode from 'qrcode';

/**
 * Render `text` (e.g. a KHQR checkout URL) as a PNG QR code, returned as a
 * Buffer suitable for Telegraf's `replyWithPhoto({ source: buffer })`.
 */
export async function qrPngBuffer(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: 'png',
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}
