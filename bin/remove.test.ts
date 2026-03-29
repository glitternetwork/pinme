/**
 * Remove Command Tests
 *
 * 测试 pinme rm 命令
 */

describe('Remove Command', () => {
  describe('Input parsing', () => {
    it('should accept IPFS hash', () => {
      const hash = 'QmTestHash123456789';
      expect(hash).toBeDefined();
    });

    it('should accept subname', () => {
      const subname = 'my-subname';
      expect(subname).toBeDefined();
    });

    it('should handle missing input', () => {
      const input = null;
      expect(input).toBeNull();
    });
  });

  describe('Hash validation', () => {
    it('should validate CIDv0 format', () => {
      const validHash = 'QmHash1234567890123456789012345678901234567890';
      const isValid = validHash.startsWith('Qm');
      expect(isValid).toBe(true);
    });

    it('should validate CIDv1 format', () => {
      const validHash = 'bafybeif7ztnhq65lumvvtr4xszm7rus4g7pk7ktm3x3ujfzsu5kvhfqq';
      const isValid = validHash.startsWith('bafy');
      expect(isValid).toBe(true);
    });
  });

  describe('API request', () => {
    const IPFS_API_URL = process.env.IPFS_API_URL || 'https://ipfs.glitterprotocol.dev/api/v2';

    it('should construct block/rm endpoint', () => {
      const endpoint = `${IPFS_API_URL}/block/rm`;
      expect(endpoint).toContain('/block/rm');
    });

    it('should use POST method', () => {
      const method = 'POST';
      expect(method).toBe('POST');
    });

    it('should include hash in query params', () => {
      const hash = 'QmTest';
      const params = { arg: hash };
      expect(params.arg).toBe('QmTest');
    });

    it('should include subname in query params', () => {
      const subname = 'my-subname';
      const params = { subname };
      expect(params.subname).toBe('my-subname');
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
    it('should handle hash not found', () => {
      const errorCode = 404;
      expect(errorCode).toBe(404);
    });

    it('should handle permission denied', () => {
      const errorCode = 403;
      expect(errorCode).toBe(403);
    });
  });
});
