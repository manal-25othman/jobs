import { Module } from '@nestjs/common';
import { CareerDataService } from './career-data.service';

@Module({ providers: [CareerDataService], exports: [CareerDataService] })
export class CareerDataModule {}
