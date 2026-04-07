export function buildReceiptContent(order) {
  const createdAt = new Date(order.createdAt || Date.now()).toLocaleString("en-AU");
  const lines = (order.items || [])
    .map((item) => `${item.qty} x ${item.name} (${Number(item.price || 0).toFixed(2)}) = ${Number(item.subtotal || 0).toFixed(2)}`)
    .join("\n");

  const paymentMethodLabel = String(order.paymentMethod || "").toUpperCase();

  const text = [
    "Uniform Shop Receipt",
    "",
    `Order: ${order.orderNumber}`,
    `Date: ${createdAt}`,
    `Payment: ${paymentMethodLabel}`,
    "",
    "Items:",
    lines,
    "",
    `Total: ${Number(order.total || 0).toFixed(2)}`
  ].join("\n");

  const htmlItems = (order.items || [])
    .map((item) => `<li>${item.qty} x ${item.name} (${Number(item.price || 0).toFixed(2)}) = ${Number(item.subtotal || 0).toFixed(2)}</li>`)
    .join("");

  const html = `
    <div style="font-family:Segoe UI,Tahoma,sans-serif;color:#1f2937;line-height:1.5">
      <h2 style="margin:0 0 8px">Uniform Shop Receipt</h2>
      <p style="margin:0 0 4px"><strong>Order:</strong> ${order.orderNumber}</p>
      <p style="margin:0 0 4px"><strong>Date:</strong> ${createdAt}</p>
      <p style="margin:0 0 12px"><strong>Payment:</strong> ${paymentMethodLabel}</p>
      <p style="margin:0 0 6px"><strong>Items</strong></p>
      <ul style="margin:0 0 12px;padding-left:18px">${htmlItems}</ul>
      <p style="margin:0"><strong>Total:</strong> ${Number(order.total || 0).toFixed(2)}</p>
    </div>
  `;

  return { text, html };
}
