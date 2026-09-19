const axios = require('axios');

async function test() {
  try {
    const loginRes = await axios.post('https://chat-application-1-hu33.onrender.com/api/auth/login', {
      email: "tharunnntej7373@gmail.com",
      password: "password123" // Guessing this might fail, let's see
    });
    console.log("Login success!", loginRes.data);
  } catch (e) {
    console.log("Login failed", e.response?.status, e.response?.data);
  }
}
test();
