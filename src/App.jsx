import { useState, useEffect } from 'react';

const MALL_ID = 'wnqka5000';
const CLIENT_ID = 'wfRrVYiQLi8HtWhJCtAy5D';
const REDIRECT_URI = 'https://orderpdtlist.netlify.app/callback';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('access_token'));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('option');
  const [progress, setProgress] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const errorMsg = params.get('error');
    if (errorMsg) setError('로그인 실패: ' + errorMsg);
    if (accessToken) {
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      setToken(accessToken);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleLogin = () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'mall.read_order',
      state: Math.random().toString(36).slice(2)
    });
    window.location.href = `https://${MALL_ID}.cafe24api.com/api/v2/oauth/authorize?${params}`;
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setToken(null);
    setResult(null);
  };

  const fetchOrders = async () => {
    if (!startDate || !endDate) {
      alert('시작일과 종료일을 모두 입력해주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress('');

    try {
      // 날짜 범위를 3일씩 분할
      const chunks = [];
      let current = new Date(startDate);
      const end = new Date(endDate);

      while (current <= end) {
        const chunkStart = current.toISOString().slice(0, 10);
        const chunkEnd = new Date(Math.min(
          new Date(current.getTime() + 2 * 24 * 60 * 60 * 1000),
          end
        )).toISOString().slice(0, 10);
        chunks.push({ start: chunkStart, end: chunkEnd });
        current = new Date(current.getTime() + 3 * 24 * 60 * 60 * 1000);
      }

      const byOption = {};
      const byProduct = {};
      let totalOrders = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        setProgress(`조회 중... (${i + 1}/${chunks.length} 구간)`);

        const params = new URLSearchParams({
          start_date: chunk.start,
          end_date: chunk.end,
          access_token: token
        });

        const res = await fetch(`/api/orders?${params}`);
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        totalOrders += data.totalOrders || 0;

        (data.byOption || []).forEach(item => {
          const key = `${item.productCode}_${item.optionValue}`;
          if (!byOption[key]) {
            byOption[key] = { ...item, totalQty: 0, orderCount: 0 };
          }
          byOption[key].totalQty += item.totalQty;
          byOption[key].orderCount += item.orderCount;
        });

        (data.byProduct || []).forEach(item => {
          const key = item.productCode;
          if (!byProduct[key]) {
            byProduct[key] = { ...item, totalQty: 0, orderCount: 0 };
          }
          byProduct[key].totalQty += item.totalQty;
          byProduct[key].orderCount += item.orderCount;
        });
      }

      setProgress('');
      setResult({
        totalOrders,
        byOption: Object.values(byOption).sort((a, b) => b.totalQty - a.totalQty),
        byProduct: Object.values(byProduct).sort((a, b) => b.totalQty - a.totalQty)
      });

    } catch (err) {
      setError('조회 실패: ' + err.message);
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  if (!token) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16 }}>
        <h2 style={{ fontSize: 24, fontWeight: 'bold' }}>📦 주문 품목 수량 집계</h2>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button onClick={handleLogin} style={{ padding: '12px 32px', fontSize: 16, backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Cafe24 로그인
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 'bold' }}>📦 주문 품목 수량 집계 (결제완료)</h2>
        <button onClick={handleLogout} style={{ padding: '8px 16px', fontSize: 14, backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          로그아웃
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6 }} />
        <span>~</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6 }} />
        <button onClick={fetchOrders} disabled={loading}
          style={{ padding: '8px 24px', fontSize: 15, backgroundColor: loading ? '#93c5fd' : '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? '조회 중...' : '집계하기'}
        </button>
      </div>

      {progress && (
        <p style={{ color: '#2563eb', marginBottom: 16, fontWeight: 'bold' }}>{progress}</p>
      )}

      {error && <p style={{ color: 'red', marginBottom: 16 }}>{error}</p>}

      {result && (
        <div>
          <p style={{ marginBottom: 16, color: '#555' }}>
            총 주문 수: <strong>{result.totalOrders}건</strong>
          </p>

          <div style={{ display: 'flex', gap: 0, marginBottom: 16 }}>
            <button onClick={() => setViewMode('option')}
              style={{ padding: '8px 20px', fontSize: 14, cursor: 'pointer', border: '1px solid #2563eb', borderRadius: '6px 0 0 6px', backgroundColor: viewMode === 'option' ? '#2563eb' : 'white', color: viewMode === 'option' ? 'white' : '#2563eb' }}>
              옵션별 보기
            </button>
            <button onClick={() => setViewMode('product')}
              style={{ padding: '8px 20px', fontSize: 14, cursor: 'pointer', border: '1px solid #2563eb', borderLeft: 'none', borderRadius: '0 6px 6px 0', backgroundColor: viewMode === 'product' ? '#2563eb' : 'white', color: viewMode === 'product' ? 'white' : '#2563eb' }}>
              상품별 보기 (옵션 합산)
            </button>
          </div>

          {viewMode === 'option' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9' }}>
                  <th style={thStyle}>순위</th>
                  <th style={thStyle}>상품명</th>
                  <th style={thStyle}>옵션</th>
                  <th style={thStyle}>주문 횟수</th>
                  <th style={thStyle}>총 수량</th>
                </tr>
              </thead>
              <tbody>
                {result.byOption.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                    <td style={tdStyle}>{i + 1}</td>
                    <td style={tdStyle}>{item.productName}</td>
                    <td style={tdStyle}>{item.optionValue}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{item.orderCount}건</td>
                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 'bold', color: '#2563eb' }}>{item.totalQty}개</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {viewMode === 'product' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9' }}>
                  <th style={thStyle}>순위</th>
                  <th style={thStyle}>상품명</th>
                  <th style={thStyle}>주문 횟수</th>
                  <th style={thStyle}>총 수량 (옵션 합산)</th>
                </tr>
              </thead>
              <tbody>
                {result.byProduct.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                    <td style={tdStyle}>{i + 1}</td>