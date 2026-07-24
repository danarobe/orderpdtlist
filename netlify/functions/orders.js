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

  // 재시도 포함 fetch (429 대비)
  const fetchWithRetry = async (url, retries = 3) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await fetch(url, { headers: apiHeaders });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
        continue;
      }
      return res.json();
    }
    throw new Error('API 요청 제한 초과 (429)');
  };

  try {
    const limit = 100;

    // ① 전체 주문 개수 조회
    const countData = await fetchWithRetry(
      `https://${mallId}.cafe24api.com/api/v2/admin/orders/count?` +
      new URLSearchParams({ start_date, end_date })
    );

    if (countData.error) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: '토큰이 만료되었습니다. 다시 로그인해주세요.' }) };
    }

    const totalCount = countData.count || 0;
    const pageCount = Math.max(1, Math.ceil(totalCount / limit));

    // ② 페이지를 4개씩 묶어서 조회 (요청 제한 회피)
    let allOrders = [];
    const offsets = [];
    for (let i = 0; i < pageCount; i++) offsets.push(i * limit);

    const BATCH_SIZE = 4;
    for (let i = 0; i < offsets.length; i += BATCH_SIZE) {
      const batch = offsets.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(offset =>
          fetchWithRetry(
            `https://${mallId}.cafe24api.com/api/v2/admin/orders?` +
            new URLSearchParams({ start_date, end_date, limit, offset, embed: 'items' })
          )
        )
      );
      results.forEach(data => {
        if (data.orders) {
          allOrders = allOrders.concat(data.orders);
        } else if (data.error) {
          throw new Error('주문 조회 실패: ' + JSON.stringify(data.error));
        }
      });
    }

    // ③ 누락 검증: 가져온 주문 수가 전체 개수와 다르면 에러
    if (totalCount > 0 && allOrders.length < totalCount) {
      throw new Error(`데이터 누락 감지 (${allOrders.length}/${totalCount}건). 다시 시도해주세요.`);
    }

    // ④ 품목별 집계 — 구매확정(N50)까지 포함, 취소/클레임 제외
    const PAID_STATUSES = ['N10', 'N20', 'N21', 'N22', 'N30', 'N40', 'N50'];
    const byOption = {};
    const byProduct = {};

    allOrders.forEach(order => {
      if (!order.items || order.items.length === 0) return;
      order.items.forEach(item => {
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