import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Health check controller
 * Provides basic service status for monitoring and load balancers
 */
@Controller('health')
export class HealthController {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Basic health check endpoint
   * Returns service status, version, and network information
   */
  @Get()
  checkHealth() {
    const stellarConfig = this.configService.get('stellar');
    const appConfig = this.configService.get('app');
    
    // Determine network from passphrase
    const network = stellarConfig?.networkPassphrase?.includes('Test') ? 'testnet' : 'mainnet';
    
    return {
      ok: true,
      version: appConfig?.version || '0.0.1',
      network,
      timestamp: new Date().toISOString(),
    };
  }
}
