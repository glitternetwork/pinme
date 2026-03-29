// Jest setup file - 加载测试环境变量
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载 .env.test 文件
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// 只在第一次加载时打印（全局变量控制）
if (!(global as any).__JEST_SETUP_DONE__) {
  (global as any).__JEST_SETUP_DONE__ = true;
  console.log('\n📋 Test Config Loaded:');
  console.log('  PINME_AUTH_TOKEN:', process.env.PINME_AUTH_TOKEN ? '***已设置***' : '未设置');
  console.log('  PINME_AUTH_ADDRESS:', process.env.PINME_AUTH_ADDRESS ? '***已设置***' : '未设置');
  console.log('  PINME_PROJECT_NAME:', process.env.PINME_PROJECT_NAME || '未设置\n');
}
