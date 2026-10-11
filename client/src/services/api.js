import axios from "axios";

const API_BASE_URL = "http://localhost:5000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

/*
 * Add the JWT token to requests automatically.
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("hemoconnect_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/*
 * Handle authentication errors globally.
 */
api.interceptors.response.use(
  (response) => response,

  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("hemoconnect_token");
      localStorage.removeItem("hemoconnect_user");
    }

    return Promise.reject(error);
  }
);

/*
 * Authentication API
 */
export const authAPI = {
  login: async (email, password) => {
    const response = await api.post("/auth/login", {
      email,
      password,
    });

    return response.data;
  },

  register: async (userData) => {
    const response = await api.post("/auth/register", userData);

    return response.data;
  },
};

/*
 * Save authenticated user information.
 */
export const saveAuthData = (authData) => {
  if (authData?.data?.token) {
    localStorage.setItem(
      "hemoconnect_token",
      authData.data.token
    );
  }

  if (authData?.data?.user) {
    localStorage.setItem(
      "hemoconnect_user",
      JSON.stringify(authData.data.user)
    );
  }
};

/*
 * Get the stored JWT token.
 */
export const getToken = () => {
  return localStorage.getItem("hemoconnect_token");
};

/*
 * Get the stored logged-in user.
 */
export const getCurrentUser = () => {
  const user = localStorage.getItem("hemoconnect_user");

  if (!user) {
    return null;
  }

  try {
    return JSON.parse(user);
  } catch {
    return null;
  }
};

/*
 * Check whether a user is currently logged in.
 */
export const isAuthenticated = () => {
  return Boolean(getToken());
};

/*
 * Log the user out.
 */
export const logout = () => {
  localStorage.removeItem("hemoconnect_token");
  localStorage.removeItem("hemoconnect_user");
};

export default api;