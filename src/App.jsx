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

  // 페이지 로드 시 URL에서 토큰 파싱
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const errorMsg = params.get('error');

    if (errorMsg) {
      setError('로그인 실패: ' + errorMsg);
    }

    if (accessToken) {
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      setToken(accessToken);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // 토큰 자동 갱신
  const refreshToken = async () => {
    const storedRefresh = localStorage.getItem('refresh_token');
    if (!storedRefresh) return null;

    const res = await fetch('/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: storedRefresh })
    });

    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      setToken(data.access_token);
      return data.access_token;
    }
    return null;
  };

  // Cafe24 로그인
  const handleLogin = () => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'mall.read_order',
      state: Math.random().toString(36).slice(2)
    });
    window.location.href =
      `https://${MALL_ID}.cafe24api.com/api/v2/oauth/authorize?${params}`;
  };

  // 로그아웃
  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setToken(null);
    setResult(null);
  };

  // 주문 집계 조회
  const fetchOrders = async () => {
    if (!startDate || !endDate) {
      alert('시작일과 종료일을 모두 입력해주세요.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let currentToken = token;
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        access_token: currentToken
      });

      let res = await fetch(`/api/orders?${params}`);

      // 토큰 만료 시 자동 갱신
      if (res.status === 401) {
        currentToken = await refreshToken();
        if (!currentToken) {
          handleLogout();
          return;
        }
        const retryParams = new URLSearchParams({
          start_date: startDate,
          end_date: endDate,
          access_token: currentToken
        });
        res = await fetch(`/api/orders?${retryParams}`);
      }

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setResult(data);
    } catch (err) {
      setError('조회 실패: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 로그인 전 화면
  if (!token) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100vh', gap: 16
      }}>
        <h2 style={{ fontSize: 24, fontWeight: 'bold' }}>📦 주문 품목 수량 집계</h2>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button
          onClick={handleLogin}
          style={{
            padding: '12px 32px', fontSize: 16,
            backgroundColor: '#2563eb', color: 'white',
            border: 'none', borderRadius: 8, cursor: 'pointer'
          }}
        >
          Cafe24 로그인
        </button>
      </div>
    );
  }

  // 로그인 후 화면
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 'bold' }}>📦 주문 품목 수량 집계</h2>
        <button
          onClick={handleLogout}
          style={{
            padding: '8px 16px', fontSize: 14,
            backgroundColor: '#ef4444', color: 'white',
            border: 'none', borderRadius: 6, cursor: 'pointer'
          }}
        >
          로그아웃
        </button>
      </div>

      {/* 날짜 선택 */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6 }}
        />
        <span>~</span>
        <input
          type="date"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6 }}
        />
        <button
          onClick={fetchOrders}
          disabled={loading}
          style={{
            padding: '8px 24px', fontSize: 15,
            backgroundColor: loading ? '#93c5fd' : '#2563eb',
            color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer'
          }}
        >
          {loading ? '조회 중...' : '집계하기'}
        </button>
      </div>

      {error && <p style={{ color: 'red', marginBottom: 16 }}>{error}</p>}

      {/* 결과 테이블 */}
      {result && (
        <div>
          <p style={{ marginBottom: 12, color: '#555' }}>
            총 주문 수: <strong>{result.totalOrders}건</strong> &nbsp;|&nbsp;
            품목 종류: <strong>{result.items.length}종</strong>
          </p>
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
              {result.items.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={tdStyle}>{i + 1}</td>
                  <td style={tdStyle}>{item.productName}</td>
                  <td style={tdStyle}>{item.optionValue}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{item.orderCount}건</td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 'bold' }}>{item.totalQty}개</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: '10px 14px',
  textAlign: 'left',
  fontWeight: 'bold',
  borderBottom: '2px solid #cbd5e1'
};

const tdStyle = {
  padding: '10px 14px'
};