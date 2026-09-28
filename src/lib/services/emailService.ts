import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

// Cấu hình AWS SES Client
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'ap-southeast-2', // Australia region
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export async function sendPasswordResetEmail(
  email: string,
  resetLink: string
) {
  try {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured');
    }

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Reset Mật Khẩu</h1>
        </div>

        <div style="background: #f8f9fa; padding: 30px;">
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Xin chào <strong>${email}</strong>,
          </p>

          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Chúng tôi nhận được yêu cầu reset mật khẩu của bạn cho tài khoản AssetFlow Pro.
          </p>

          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            Vui lòng nhấp vào nút dưới đây để đặt mật khẩu mới:
          </p>

          <div style="text-align: center; margin: 40px 0;">
            <a href="${resetLink}" style="
              display: inline-block;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 14px 40px;
              text-decoration: none;
              border-radius: 8px;
              font-weight: bold;
              font-size: 16px;
              cursor: pointer;
              transition: transform 0.2s;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
              Reset Mật Khẩu
            </a>
          </div>

          <p style="color: #999; font-size: 14px; text-align: center;">
            Hoặc dán link này vào trình duyệt:
          </p>
          <p style="color: #667eea; font-size: 12px; word-break: break-all; background: white; padding: 10px; border-radius: 5px; border-left: 4px solid #667eea;">
            ${resetLink}
          </p>

          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

          <p style="color: #999; font-size: 14px;">
            ⏰ <strong>Lưu ý quan trọng:</strong> Link này sẽ hết hạn trong <strong>24 giờ</strong>.
          </p>

          <p style="color: #999; font-size: 14px;">
            ⚠️ Nếu bạn không yêu cầu reset mật khẩu, vui lòng bỏ qua email này hoặc liên hệ với chúng tôi ngay lập tức.
          </p>

          <p style="color: #999; font-size: 14px;">
            🔒 Vì lý do bảo mật, chúng tôi không bao giờ gửi mật khẩu qua email.
          </p>
        </div>

        <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; text-align: center; border-top: 1px solid #ddd;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            © 2026 AssetFlow Pro. All rights reserved. | <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="color: #667eea; text-decoration: none;">Visit Website</a>
          </p>
        </div>
      </div>
    `;

    const params = {
      Source: process.env.EMAIL_FROM || 'noreply@fadogroup.com.au',
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Subject: {
          Data: '🔐 Reset Mật Khẩu AssetFlow Pro',
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: htmlContent,
            Charset: 'UTF-8',
          },
        },
      },
    };

    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);

    console.log(`✅ Password reset email sent to ${email}. Message ID: ${response.MessageId}`);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    console.error('❌ Email sending error:', error);
    throw new Error('Không thể gửi email reset. Vui lòng kiểm tra AWS SES configuration.');
  }
}

/**
 * Email mời nhân sự mới điền biểu mẫu onboarding.
 * Gửi tới email cá nhân kèm link landing page public.
 */
export async function sendOnboardingInviteEmail(
  email: string,
  candidateName: string,
  formLink: string
) {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials not configured');
  }

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 36px 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 26px;">🎉 Chào mừng gia nhập FADO Group!</h1>
      </div>

      <div style="background: #f8f9fa; padding: 30px;">
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Xin chào <strong>${candidateName}</strong>,
        </p>

        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Chúc mừng bạn đã trở thành thành viên mới của <strong>FADO Group</strong>!
          Để hoàn tất thủ tục nhận việc, vui lòng điền đầy đủ thông tin cá nhân theo biểu mẫu dưới đây:
        </p>

        <div style="text-align: center; margin: 36px 0;">
          <a href="${formLink}" style="
            display: inline-block;
            background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            color: white;
            padding: 14px 44px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            font-size: 16px;">
            Điền Biểu Mẫu Nhận Việc
          </a>
        </div>

        <p style="color: #999; font-size: 14px; text-align: center;">
          Hoặc dán link này vào trình duyệt:
        </p>
        <p style="color: #6366f1; font-size: 12px; word-break: break-all; background: white; padding: 10px; border-radius: 5px; border-left: 4px solid #6366f1;">
          ${formLink}
        </p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 28px 0;">

        <p style="color: #999; font-size: 14px;">
          📋 <strong>Chuẩn bị trước:</strong> CCCD, thông tin tài khoản ngân hàng, thông tin người thân liên hệ,
          và bản scan hồ sơ (CCCD, bằng cấp, sơ yếu lý lịch...) nếu có.
        </p>
        <p style="color: #999; font-size: 14px;">
          ⏰ Link có hiệu lực trong <strong>14 ngày</strong>. Nếu link hết hạn, vui lòng liên hệ bộ phận Tuyển Dụng.
        </p>
      </div>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; text-align: center; border-top: 1px solid #ddd;">
        <p style="color: #999; font-size: 12px; margin: 0;">
          © 2026 FADO Group — AssetFlow Pro
        </p>
      </div>
    </div>
  `;

  const params = {
    Source: process.env.EMAIL_FROM || 'noreply@fadogroup.com.au',
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: '🎉 FADO Group — Biểu mẫu thông tin nhận việc', Charset: 'UTF-8' },
      Body: { Html: { Data: htmlContent, Charset: 'UTF-8' } },
    },
  };

  const response = await sesClient.send(new SendEmailCommand(params));
  console.log(`✅ Onboarding invite sent to ${email}. Message ID: ${response.MessageId}`);
  return { success: true, messageId: response.MessageId };
}

/**
 * Email mật khẩu SSO ban đầu — gửi khi hệ thống TỰ SINH mật khẩu lúc đồng bộ user
 * sang SSO (spec SSO §7.5). KHÔNG log mật khẩu ở bất kỳ đâu.
 */
export async function sendSsoInitialPasswordEmail(
  email: string,
  name: string,
  password: string
) {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS credentials not configured');
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://assetflow.fadoai.com';
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🔑 Tài khoản FADO SSO của bạn</h1>
      </div>
      <div style="background: #f8f9fa; padding: 30px;">
        <p style="color: #555; font-size: 16px; line-height: 1.6;">Xin chào <strong>${name}</strong>,</p>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Tài khoản đăng nhập FADO SSO đã được tạo cho bạn. Từ nay bạn đăng nhập AssetFlow
          (và các ứng dụng FADO khác) bằng tài khoản này.
        </p>
        <p style="color: #555; font-size: 15px;">Email đăng nhập: <strong>${email}</strong></p>
        <p style="color: #555; font-size: 15px;">Mật khẩu ban đầu: <strong style="font-family: monospace;">${password}</strong></p>
        <p style="color: #999; font-size: 13px;">Vui lòng đổi mật khẩu sau lần đăng nhập đầu tiên.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${appUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 36px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px;">Đăng nhập AssetFlow</a>
        </div>
      </div>
    </div>
  `;
  const command = new SendEmailCommand({
    Source: process.env.EMAIL_FROM || 'noreply@fadogroup.com.au',
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: 'Tài khoản FADO SSO của bạn', Charset: 'UTF-8' },
      Body: { Html: { Data: htmlContent, Charset: 'UTF-8' } },
    },
  });
  await sesClient.send(command);
}

// Test email configuration
export async function testEmailConfiguration() {
  try {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return { success: false, error: 'AWS credentials not configured' };
    }

    // Try to send a simple test email
    const testParams = {
      Source: process.env.EMAIL_FROM || 'noreply@fadogroup.com.au',
      Destination: {
        ToAddresses: [process.env.EMAIL_FROM || 'test@example.com'],
      },
      Message: {
        Subject: {
          Data: 'AWS SES Configuration Test',
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: '<p>This is a test email from AssetFlow Pro.</p>',
            Charset: 'UTF-8',
          },
        },
      },
    };

    const command = new SendEmailCommand(testParams);
    await sesClient.send(command);

    return { success: true, message: 'AWS SES configuration is valid' };
  } catch (error) {
    console.error('AWS SES configuration error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
