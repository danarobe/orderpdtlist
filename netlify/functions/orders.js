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
        order_status: 'N00,N10,N20,N30'
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

    // 품목별 수량 집계
    const summary = {};

    allOrders.forEach(order => {
      order.items.forEach(item => {
        const key = `${item.product_code}_${item.variant_code}`;

        if (!summary[key]) {
          summary[key] = {
            productCode: item.product_code,
            productName: item.product_name,
            optionValue: item.option_value || '옵션없음',
            totalQty: 0,
            orderCount: 0
          };
        }

        summary[key].totalQty += Number(item.quantity);
        summary[key].orderCount += 1;
      });
    });

    const result = Object.values(summary)
      .sort((a, b) => b.totalQty - a.totalQty);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        totalOrders: allOrders.length,
        items: result
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