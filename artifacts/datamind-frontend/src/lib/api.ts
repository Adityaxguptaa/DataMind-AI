export const API_BASE = '/api';

class ApiClient {
  private async getToken(): Promise<string | null> {
    return localStorage.getItem('access_token');
  }

  private async getRefreshToken(): Promise<string | null> {
    return localStorage.getItem('refresh_token');
  }

  private setTokens(access: string, refresh: string) {
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
  }

  private clearTokens() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getToken();
    const headers = new Headers(options.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
    let response = await fetch(fullUrl, { ...options, headers });

    if (response.status === 401 && token) {
      const refresh = await this.getRefreshToken();
      if (refresh) {
        const refreshResponse = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
        });

        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          this.setTokens(data.access_token, data.refresh_token || refresh);
          headers.set('Authorization', `Bearer ${data.access_token}`);
          response = await fetch(fullUrl, { ...options, headers });
        } else {
          this.clearTokens();
          window.location.href = '/login';
        }
      } else {
        this.clearTokens();
        window.location.href = '/login';
      }
    }

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  async get<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await this.fetch(url, { ...options, method: 'GET' });
    return response.json();
  }

  async post<T>(url: string, data?: any, options?: RequestInit): Promise<T> {
    const response = await this.fetch(url, {
      ...options,
      method: 'POST',
      body: data instanceof FormData ? data : JSON.stringify(data),
    });
    return response.json();
  }

  async put<T>(url: string, data?: any, options?: RequestInit): Promise<T> {
    const response = await this.fetch(url, {
      ...options,
      method: 'PUT',
      body: data instanceof FormData ? data : JSON.stringify(data),
    });
    return response.json();
  }

  async delete<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await this.fetch(url, { ...options, method: 'DELETE' });
    return response.json();
  }
}

export const api = new ApiClient();
