// services/EmailService.js

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'noreply@intervium.com.tr';
const APP_NAME = 'Intervium';

/**
 * 6 haneli doğrulama kodu üret
 */
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Email doğrulama kodu gönder
 */
exports.sendVerificationEmail = async (email, name, code) => {
  try {
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      to: email,
      subject: 'E-posta Adresinizi Doğrulayın — Intervium',
      html: buildVerificationEmailHTML(name, code)
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error('Email gönderilemedi');
    }

    console.log('✅ Verification email sent:', data?.id);
    return true;
  } catch (error) {
    console.error('sendVerificationEmail error:', error);
    throw error;
  }
};

/**
 * Şifre sıfırlama kodu gönder
 */
exports.sendPasswordResetEmail = async (email, name, code) => {
  try {
    const { data, error } = await resend.emails.send({
      from: `${APP_NAME} <${FROM_EMAIL}>`,
      to: email,
      subject: 'Şifre Sıfırlama Kodu — Intervium',
      html: buildPasswordResetEmailHTML(name, code)
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error('Email gönderilemedi');
    }

    console.log('✅ Password reset email sent:', data?.id);
    return true;
  } catch (error) {
    console.error('sendPasswordResetEmail error:', error);
    throw error;
  }
};

exports.generateVerificationCode = generateVerificationCode;

// ─── HTML Templates ──────────────────────────────────────────────────────────

const buildVerificationEmailHTML = (name, code) => `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>E-posta Doğrulama</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Intervium</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:13px;letter-spacing:2px;text-transform:uppercase;">Sanal Mülakat Simülatörü</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;color:#1a1a2e;font-size:22px;font-weight:700;">Merhaba, ${name}!</p>
              <p style="margin:0 0 32px;color:#6b7280;font-size:15px;line-height:1.6;">
                Intervium hesabınızı oluşturduğunuz için teşekkürler. E-posta adresinizi doğrulamak için aşağıdaki kodu kullanın.
              </p>

              <!-- Code Box -->
              <div style="background:#f4f4f5;border-radius:12px;padding:28px;text-align:center;margin-bottom:32px;">
                <p style="margin:0 0 8px;color:#6b7280;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Doğrulama Kodunuz</p>
                <p style="margin:0;color:#1a1a2e;font-size:42px;font-weight:800;letter-spacing:12px;">${code}</p>
              </div>

              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;text-align:center;">
                Bu kod <strong>15 dakika</strong> geçerlidir.<br/>
                Eğer bu işlemi siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © 2025 Intervium · intervium.com.tr
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const buildPasswordResetEmailHTML = (name, code) => `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Şifre Sıfırlama</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Intervium</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:13px;letter-spacing:2px;text-transform:uppercase;">Sanal Mülakat Simülatörü</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;color:#1a1a2e;font-size:22px;font-weight:700;">Merhaba, ${name}!</p>
              <p style="margin:0 0 32px;color:#6b7280;font-size:15px;line-height:1.6;">
                Şifre sıfırlama talebinde bulundunuz. Aşağıdaki kodu kullanarak şifrenizi sıfırlayabilirsiniz.
              </p>

              <!-- Code Box -->
              <div style="background:#f4f4f5;border-radius:12px;padding:28px;text-align:center;margin-bottom:32px;">
                <p style="margin:0 0 8px;color:#6b7280;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">Şifre Sıfırlama Kodunuz</p>
                <p style="margin:0;color:#1a1a2e;font-size:42px;font-weight:800;letter-spacing:12px;">${code}</p>
              </div>

              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;text-align:center;">
                Bu kod <strong>15 dakika</strong> geçerlidir.<br/>
                Eğer bu işlemi siz yapmadıysanız şifreniz güvende, bu e-postayı görmezden gelebilirsiniz.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                © 2025 Intervium · intervium.com.tr
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;