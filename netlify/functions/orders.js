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
        order_status: 'N10', // 결제완료만
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

    // ① 옵션별 집계 (상품 + 옵션 구분)
    const byOption = {};
    // ② 상품별 집계 (옵션 무관 전체)
    const byProduct = {};

    allOrders.forEach(order => {
        if (!order.items || order.items.length === 0) return;
      order.items.forEach(item => {
        const qty = Number(item.quantity);

        // 옵션별
        const optionKey = `${item.product_code}_${item.variant_code}`;
        if (!byOption[optionKey]) {
          byOption[optionKey] = {
            productCode: item.product_code,
            productName: item.product_name,
            optionValue: item.option_value || '옵션없음',
            totalQty: 0,
            orderCount: 0
          };
        }
        byOption[optionKey].totalQty += qty;
        byOption[optionKey].orderCount += 1;

        // 상품별 (옵션 무관)
        const productKey = item.product_code;
        if (!byProduct[productKey]) {
          byProduct[productKey] = {
            productCode: item.product_code,
            productName: item.product_name,
            totalQty: 0,
            orderCount: 0
          };
        }
        byProduct[productKey].totalQty += qty;
        byProduct[productKey].orderCount += 1;
      });
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        totalOrders: allOrders.length,
        byOption: Object.values(byOption).sort((a, b) => b.totalQty - a.totalQty),
        byProduct: Object.values(byProduct).sort((a, b) => b.totalQty - a.totalQty)
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