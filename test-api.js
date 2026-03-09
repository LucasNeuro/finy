// Teste da API OpenCNPJ
async function testOpenCnpjApi() {
  try {
    console.log('Testing OpenCNPJ API...');
    
    // Teste direto da API
    const response = await fetch('https://api.opencnpj.org/11222333000100');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error response:', errorText);
    } else {
      const data = await response.json();
      console.log('Success data:', data);
    }
    
  } catch (error) {
    console.error('Fetch error:', error.message);
  }
}

// Teste da rota Next.js
async function testNextJsRoute() {
  try {
    console.log('\nTesting Next.js route...');
    
    // Teste da rota local (você precisa ter o servidor rodando)
    const response = await fetch('http://localhost:3000/api/opencnpj/11222333000100');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error response:', errorText);
    } else {
      const data = await response.json();
      console.log('Success data:', data);
    }
    
  } catch (error) {
    console.error('Fetch error:', error.message);
  }
}

console.log('=== API Test ===');
testOpenCnpjApi().then(() => testNextJsRoute());