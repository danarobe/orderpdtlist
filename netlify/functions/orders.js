exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { start_date, end_date, access_token } = event.queryStringParameters;
  const mallId = process.env.CAFE24_MALL_ID;

  if (!access_token) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: '로그인이 필요합니다.' })
    };
  }

  try {
    let allOrders = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const params = new URLSearchParams({
        start_date,
        end_date,
        limit,
        offset,
        embed: 'items'
      });

      const res = await fetch(
        `https://${mallId}.cafe24api.com/api/v2/admin/orders?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await res.json();

      if (!data.orders || data.orders.length === 0) break;

      allOrders = allOrders.concat(data.orders);
      if (data.orders.length < limit) break;
      offset += limit;
    }

// 임시: 첫 번째 주문 전체 구조 확인
const firstOrder = allOrders.length > 0 ? allOrders[0] : null;

return {
  statusCode: 200,
  headers,
  body: JSON.stringify({
    totalOrders: allOrders.length,
    firstOrder,
    byOption: [],
    byProduct: []
  })
};

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};