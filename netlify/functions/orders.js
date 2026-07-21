export const handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const { start_date, end_date, access_token } = event.queryStringParameters;
  const mallId = process.env.CAFE24_MALL_ID;
  if (!access_token) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: '로그인이 필요합니다.' }) };
  }

  const apiHeaders = {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  };

  try {
    const limit = 100;

    // ① 전체 주문 개수 먼저 조회
    const countRes = await fetch(
      `https://${mallId}.cafe24api.com/api/v2/admin/orders/count?` +
      new URLSearchParams({ start_date, end_date }),
      { headers: apiHeaders }
    );
    const countData = await countRes.json();

    if (countData.error) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: '토큰이 만료되었습니다. 다시 로그인해주세요.' }) };
    }

    const totalCount = countData.count || 0;

    // ② 모든 페이지 병렬 조회
    const offsets = [];
    for (let i = 0; i < Math.ceil(totalCount / limit); i++) offsets.push(i * limit);
    if (offsets.length === 0) offsets.push(0);

    const results = await Promise.all(
      offsets.map(offset =>
        fetch(
          `https://${mallId}.cafe24api.com/api/v2/admin/orders?` +
          new URLSearchParams({ start_date, end_date, limit, offset, embed: 'items' }),
          { headers: apiHeaders }
        ).then(r => r.json())
      )
    );

    let allOrders = [];
    results.forEach(data => { if (data.orders) allOrders = allOrders.concat(data.orders); });

    // ③ 품목별 집계 (결제완료 계열만, 취소/클레임 제외)
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