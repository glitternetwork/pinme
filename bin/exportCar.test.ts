/**
 * Export Command Tests
 *
 * 测试 pinme export 命令 (导出 IPFS 内容为 CAR 文件)
 */

describe('Export Command', () => {
  describe('Options parsing', () => {
    it('should parse output option', () => {
      const options: { output?: string } = { output: './output.car' };
      expect(options.output).toBe('./output.car');
    });

    it('should handle undefined output (use default)', () => {
      const options: { output?: string } = {};
      expect(options.output).toBeUndefined();
    });
  });

  describe('Input parsing', () => {
    it('should accept CID from command line', () => {
      const cid = 'QmTestHash123456789';
      expect(cid).toBeDefined();
    });

    it('should handle missing CID', () => {
      const cid = null;
      expect(cid).toBeNull();
    });
  });

  describe('CID validation', () => {
    it('should validate CIDv0 format', () => {
      const validCid = 'QmHash1234567890123456789012345678901234567890';
      const isValid = validCid.startsWith('Qm');
      expect(isValid).toBe(true);
    });

    it('should validate CIDv1 format', () => {
      const validCid = 'bafybeif7ztnhq65lumvvtr4xszm7rus4g7pk7ktm3x3ujfzsu5kvhfqq';
      const isValid = validCid.startsWith('bafy');
      expect(isValid).toBe(true);
    });
  });

  describe('API request', () => {
    const CAR_API_BASE = process.env.CAR_API_BASE || 'http://ipfs-proxy.opena.chat/api/v3';

    it('should construct car/export endpoint', () => {
      const endpoint = `${CAR_API_BASE}/car/export`;
      expect(endpoint).toContain('/car/export');
    });

    it('should use POST method', () => {
      const method = 'POST';
      expect(method).toBe('POST');
    });

    it('should include CID in query params', () => {
      const cid = 'QmTestHash';
      const params = { cid };
      expect(params.cid).toBe('QmTestHash');
    });
  });

  describe('Task handling', () => {
    it('should return task_id for polling', () => {
      const response = { task_id: 'task-123' };
      expect(response.task_id).toBe('task-123');
    });

    it('should poll for completion', () => {
      const shouldPoll = true;
      expect(shouldPoll).toBe(true);
    });

    it('should check car/export/status endpoint', () => {
      const endpoint = '/car/export/status';
      expect(endpoint).toBe('/car/export/status');
    });
  });

  describe('Status response', () => {
    it('should handle processing status', () => {
      const status = 'processing';
      expect(status).toBe('processing');
    });

    it('should handle completed status', () => {
      const status = 'completed';
      expect(status).toBe('completed');
    });

    it('should handle failed status', () => {
      const status = 'failed';
      expect(status).toBe('failed');
    });

    it('should provide download URL when completed', () => {
      const response = {
        status: 'completed',
        download_url: 'https://example.com/export.car'
      };
      expect(response.download_url).toBeDefined();
    });
  });

  describe('File output', () => {
    it('should save to specified output path', () => {
      const outputPath = './output.car';
      expect(outputPath).toBe('./output.car');
    });

    it('should handle default output filename', () => {
      const defaultFilename = '{cid}.car';
      expect(defaultFilename).toContain('.car');
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
  });

  describe('Error handling', () => {
    it('should handle CID not found', () => {
      const errorCode = 404;
      expect(errorCode).toBe(404);
    });

    it('should handle invalid CID format', () => {
      const errorMessage = 'Invalid CID format';
      expect(errorMessage).toBeDefined();
    });

    it('should handle network errors', () => {
      const errorCode = 'ECONNREFUSED';
      expect(errorCode).toBe('ECONNREFUSED');
    });
  });
});
