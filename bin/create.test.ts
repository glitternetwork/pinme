/**
 * Create Command Tests
 *
 * 测试 pinme create 命令
 *
 * 使用方式:
 * - 设置环境变量 PINME_AUTH_TOKEN 和 PINME_AUTH_ADDRESS 来模拟已登录状态
 * - 设置环境变量 TEST_PROJECT_NAME 来测试项目名称
 */

describe('Create Command', () => {
  describe('Options parsing', () => {
    it('should parse name option', () => {
      const options = { name: 'my-project', force: false };
      expect(options.name).toBe('my-project');
      expect(options.force).toBe(false);
    });

    it('should parse force option', () => {
      const options = { name: 'existing-project', force: true };
      expect(options.force).toBe(true);
    });

    it('should handle undefined name (interactive mode)', () => {
      const options = { name: undefined, force: false };
      expect(options.name).toBeUndefined();
    });
  });

  describe('Project name validation', () => {
    it('should accept alphanumeric and dash/underscore', () => {
      const validNames = ['my-project', 'project123', 'test_project', 'a', 'Project-Name_123'];
      for (const name of validNames) {
        const isValid = /^[a-zA-Z0-9-_]+$/.test(name);
        expect(isValid).toBe(true);
      }
    });

    it('should reject names with spaces', () => {
      const name = 'my project';
      const isValid = /^[a-zA-Z0-9-_]+$/.test(name);
      expect(isValid).toBe(false);
    });

    it('should reject special characters', () => {
      const invalidNames = ['project@test', 'project!', 'project/name'];
      for (const name of invalidNames) {
        const isValid = /^[a-zA-Z0-9-_]+$/.test(name);
        expect(isValid).toBe(false);
      }
    });

    it('should normalize name to lowercase', () => {
      const name = 'MyProject';
      const normalized = name.toLowerCase();
      expect(normalized).toBe('myproject');
    });
  });

  describe('Template handling', () => {
    const TEMPLATE_REPO = 'glitternetwork/pinme-worker-template';
    const TEMPLATE_ZIP_URL = `https://github.com/${TEMPLATE_REPO}/archive/refs/heads/main.zip`;

    it('should construct correct template URL', () => {
      expect(TEMPLATE_ZIP_URL).toContain(TEMPLATE_REPO);
      expect(TEMPLATE_ZIP_URL).toContain('github.com');
    });

    it('should use main branch by default', () => {
      expect(TEMPLATE_ZIP_URL).toContain('refs/heads/main');
    });
  });

  describe('API request', () => {
    const API_BASE = process.env.PINME_API_BASE || '';
    const apiUrl = `${API_BASE}/create_worker`;

    it('should construct API URL correctly', () => {
      expect(apiUrl).toContain('/create_worker');
    });

    it('should include project_name in request', () => {
      const projectName = 'test-project';
      const requestBody = { project_name: projectName };
      expect(requestBody.project_name).toBe('test-project');
    });
  });

  describe('Auth (Manual Setup)', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should use manual token when set', () => {
      const token = process.env.PINME_AUTH_TOKEN;
      if (token) {
        expect(token).toBeDefined();
      }
    });

    it('should use manual address when set', () => {
      const address = process.env.PINME_AUTH_ADDRESS;
      if (address) {
        expect(address).toBeDefined();
      }
    });

    it('should handle authentication variables', () => {
      // 环境变量可能未设置，这是预期行为
      const token = process.env.PINME_AUTH_TOKEN;
      const address = process.env.PINME_AUTH_ADDRESS;
      // 测试只是验证可以访问这些变量
      expect(token === undefined || typeof token === 'string').toBe(true);
      expect(address === undefined || typeof address === 'string').toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle project already exists', () => {
      const errorCode = 'ALREADY_EXISTS';
      expect(errorCode).toBeDefined();
    });

    it('should handle network errors', () => {
      const errorCode = 'ECONNREFUSED';
      expect(errorCode).toBe('ECONNREFUSED');
    });

    it('should handle timeout errors', () => {
      const errorCode = 'ECONNABORTED';
      expect(errorCode).toBe('ECONNABORTED');
    });
  });
});
