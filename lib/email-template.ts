export function wrapEmailHtml(sections: string[], date: string): string {
  const body = sections.join(`
    <div style="height:1px;background:linear-gradient(90deg,transparent,#C9A84C40,transparent);margin:28px 0;"></div>
  `);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#EDEEF0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EDEEF0;padding:32px 16px;">
    <tr><td align="center">

      <!-- Container -->
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#0A1628;border-radius:10px 10px 0 0;padding:28px 36px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <div style="font-size:11px;font-weight:700;letter-spacing:2.5px;color:#C9A84C;text-transform:uppercase;margin-bottom:6px;">Daily Market Signal</div>
                  <div style="font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:-0.3px;line-height:1.2;">Indian Market Intelligence</div>
                </td>
                <td align="right" valign="top">
                  <div style="font-size:12px;color:#8B9EB7;font-weight:500;white-space:nowrap;line-height:1.6;">${date}</div>
                  <div style="font-size:11px;color:#4A5C72;margin-top:2px;">NSE / BSE</div>
                </td>
              </tr>
            </table>
            <!-- Gold rule -->
            <div style="height:2px;background:linear-gradient(90deg,#C9A84C,#E8C96B,#C9A84C40);margin-top:20px;border-radius:1px;"></div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#FFFFFF;padding:32px 36px;border-left:1px solid #DDE1E8;border-right:1px solid #DDE1E8;">
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#0A1628;border-radius:0 0 10px 10px;padding:20px 36px;border-top:2px solid #C9A84C20;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <div style="font-size:10px;color:#4A5C72;line-height:1.7;">
                    This report is generated for informational purposes only and does not constitute investment advice.<br>
                    Past performance is not indicative of future results. Data sourced from NSE/BSE public feeds.
                  </div>
                </td>
                <td align="right" valign="middle" style="padding-left:20px;white-space:nowrap;">
                  <div style="font-size:10px;color:#C9A84C;font-weight:700;letter-spacing:1px;">DMS</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;
}
