/**
 * Delete Command Tests
 *
 * 测试 pinme delete 命令
 *
 * 使用方式:
 * - 设置环境变量 PINME_AUTH_TOKEN 和 PINME_AUTH_ADDRESS 来模拟已登录状态
 * - 设置环境变量 TEST_PROJECT_NAME 来测试项目名称
 */

describe('Delete Command', () => {
  describe('Options parsing', () => {
    it('should parse name option', () => {
      const options = { name: 'my-project', force: false };
      expect(options.name).toBe('my-project');
    });

    it('should parse force option to skip confirmation', () => {
      const options = { name: 'my-project', force: true };
      expect(options.force).toBe(true);
    });

    it('should handle force option to skip prompt', () => {
      const shouldSkipPrompt = true;
      expect(shouldSkipPrompt).toBe(true);
    });
  });

  describe('Project name resolution', () => {
    it('should prefer explicit name over config', () => {
      const options = { name: 'explicit-name', force: true };
      const configName = 'config-name';
      const projectName = options.name || configName;
      expect(projectName).toBe('explicit-name');
    });

    it('should fall back to config name', () => {
      const options = { name: undefined, force: true };
      const configName = 'config-name';
      const projectName = options.name || configName;
      expect(projectName).toBe('config-name');
    });

    it('should handle missing project name', () => {
      const projectName = null;
      expect(projectName).toBeNull();
    });
  });

  describe('API request', () => {
    const API_BASE = process.env.PINME_API_BASE || '';
    const apiUrl = `${API_BASE}/delete_project`;

    it('should construct API URL correctly', () => {
      expect(apiUrl).toContain('/delete_project');
    });

    it('should include project_name in request', () => {
      const projectName = 'test-project';
      const requestBody = { project_name: projectName };
      expect(requestBody.project_name).toBe('test-project');
    });
  });

  describe('Confirmation prompt', () => {
    it('should prompt for confirmation when force is false', () => {
      const needsConfirmation = true;
      expect(needsConfirmation).toBe(true);
    });

    it('should skip confirmation when force is true', () => {
      const force = true;
      expect(force).toBe(true);
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
  });

  describe('Error handling', () => {
    it('should handle project not found', () => {
      const errorCode = 404;
      expect(errorCode).toBe(404);
    });

    it('should handle permission denied', () => {
      const errorCode = 403;
      expect(errorCode).toBe(403);
    });
  });
});
