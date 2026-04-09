export function wrapEmailHtml(sections: string[], date: string): string {
  const body = sections.join(
    '<hr style="border:none;border-top:1px solid #E8E5E0;margin:24px 0;">'
  );
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 24px;">
  <div style="margin-bottom:24px;">
    <h1 style="font-size:22px;font-weight:700;color:#1A1A1A;margin:0 0 4px;">Daily Market Signal</h1>
    <p style="font-size:13px;color:#9B9B9B;margin:0;">${date} - Indian Market Brief</p>
  </div>
  <div style="background:#FFFFFF;border-radius:12px;padding:24px;border:1px solid #E8E5E0;">
    ${body}
  </div>
  <div style="margin-top:24px;text-align:center;">
    <p style="font-size:12px;color:#9B9B9B;margin:0;">Powered by Daily Market Signal - NSE/BSE Market Intelligence</p>
  </div>
</div>
</body>
</html>`;
}
