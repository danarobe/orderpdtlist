export const handler = async (event) => {
  const { code, error } = event.queryStringParameters;
  if (error) {
    return { statusCode: 302, headers: { Location: '/?error=auth_denied' } };
  }
  try {
    const mallId = process.env.CAFE24_MALL_ID;
    const clientId = process.env.CAFE24_CLIENT_ID;
    const clientSecret = process.env.CAFE24_CLIENT_SECRET;
    const redirectUri = process.env.REDIRECT_URI;
    const tokenResponse = await fetch(
      `https://${mallId}.cafe24api.com/api/v2/oauth/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
        },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
      }
    );
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) throw new Error('토큰 발급 실패: ' + JSON.stringify(tokenData));
    const params = new URLSearchParams({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in
    });
    return { statusCode: 302, headers: { Location: `/?${params.toString()}` } };
  } catch (err) {
    return { statusCode: 302, headers: { Location: `/?error=${encodeURIComponent(err.message)}` } };
  }
};