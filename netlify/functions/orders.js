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
    return { statusCode: 401, headers, body: JSON.stringify({ error: '로그인이 필요합니다.' }) };
  }
  try {
    const limit = 100;
    const firstRes = await fetch(
      `https://${mallId}.cafe24api.com/api/v2/admin/orders?` +
      new URLSearchParams({ start_date, end_date, limit, offset: 0, embed: 'items' }),
      { headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' } }
    );
    const firstData = await firstRes.json();
    if (!firstData.orders) throw new Error(JSON.stringify(firstData));
    const totalCount = firstData.total_count || firstData.orders.length;
    let allOrders = [...firstData.orders];
    if (totalCount > limit) {
      const offsets = [];
      for (let i = 1; i < Math.ceil(totalCount / limit); i++) offsets.push(i * limit);
      const results = await Promise.all(
        offsets.map(offset =>
          fetch(
            `https://${mallId}.cafe24api.com/api/v2/admin/orders?` +
            new URLSearchParams({ start_date, end_date, limit, offset, embed: 'items' }),
            { headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' } }
          ).then(r => r.json())
        )
      );
      results.forEach(data => { if (data.orders) allOrders = allOrders.concat(data.orders); });
    }
    const byOption = {};
    const byProduct = {};
    allOrders.forEach(order => {
      if (!order.items || order.items.length === 0) return;
      order.items.forEach(item => {
        const PAID_STATUSES = ['N10', 'N20', 'N30', 'N40', 'N41', 'N42'];
        if (!PAID_STATUSES.includes(item.order_status)) return;
        if (item.claim_code) return;
        const qty = Number(item.quantity);
        const optionKey = `${item.product_code}_${item.variant_code}`;
        if (!byOption[optionKey]) {
          byOption[optionKey] = { productCode: item.product_code, productName: item.product_name, optionValue: item.option_value || '옵션없음', totalQty: 0, orderCount: 0 };
        }
        byOption[optionKey].totalQty += qty;
        byOption[optionKey].orderCount += 1;
        const productKey = item.product_code;
        if (!byProduct[productKey]) {
          byProduct[productKey] = { productCode: item.product_code, productName: item.product_name, totalQty: 0, orderCount: 0 };
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
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};