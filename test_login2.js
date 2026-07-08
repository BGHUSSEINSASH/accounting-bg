const http = require('http');

function request(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== Login ===');
  const login = await request('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  console.log('Status:', login.status);
  console.log('Token:', login.data.token.substring(0, 30) + '...');
  console.log('Refresh:', login.data.refreshToken.substring(0, 30) + '...');
  const { token, refreshToken } = login.data;

  console.log('\n=== Refresh Token ===');
  const refresh = await request('POST', '/api/auth/refresh', { refreshToken });
  console.log('Status:', refresh.status);
  if (refresh.status === 200) {
    console.log('New token:', refresh.data.token.substring(0, 30) + '...');
  } else {
    console.log('Error:', refresh.data);
  }

  console.log('\n=== Profile (with new token) ===');
  const profile = await request('GET', '/api/auth/profile', null, { Authorization: `Bearer ${refresh.data?.token || token}` });
  console.log('Status:', profile.status);
  console.log('User:', profile.data?.full_name);

  console.log('\n=== Logout ===');
  const logout = await request('POST', '/api/auth/logout', null, { Authorization: `Bearer ${token}` });
  console.log('Status:', logout.status, logout.data);

  console.log('\n=== Health ===');
  const health = await request('GET', '/api/health');
  console.log('Health:', JSON.stringify(health.data, null, 2));
}

main().catch(console.error);
