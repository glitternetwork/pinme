// Mock for axios

interface MockAxiosResponse {
  data: any;
  status: number;
  statusText: string;
  headers: any;
}

interface MockAxiosError extends Error {
  response?: {
    status: number;
    data: any;
  };
  code?: string;
  message: string;
}

const axios = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};

// Default mock implementations
(axios.get as jest.Mock).mockResolvedValue({ data: {}, status: 200 });
(axios.post as jest.Mock).mockResolvedValue({
  data: { code: 200, data: { project_name: 'test', api_domain: 'test.dev', uuid: '123' } },
  status: 200,
});
(axios.put as jest.Mock).mockResolvedValue({ data: {}, status: 200 });
(axios.delete as jest.Mock).mockResolvedValue({ data: {}, status: 200 });

export default axios;
export { MockAxiosResponse, MockAxiosError };
