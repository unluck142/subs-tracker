import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isDateString } from '../common/dates';
import { periodUnitEnum, type PeriodUnit } from '../db/schema';

@ValidatorConstraint({ name: 'dateOnly' })
class DateOnlyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isDateString(value);
  }
  defaultMessage() {
    return 'Дата должна быть в формате ГГГГ-ММ-ДД';
  }
}

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateSubscriptionDto {
  /** ID сервиса из каталога. Если не указан — нужна customName */
  @IsOptional()
  @IsInt()
  serviceId?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  customName?: string;

  /** Цена в рублях, например 299 или 149.5 */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  price!: number;

  @IsIn(periodUnitEnum.enumValues)
  periodUnit!: PeriodUnit;

  @IsInt()
  @Min(1)
  @Max(24)
  periodCount!: number;

  @Validate(DateOnlyConstraint)
  nextChargeDate!: string;

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  remindDaysBefore?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  customName?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  price?: number;

  @IsOptional()
  @IsIn(periodUnitEnum.enumValues)
  periodUnit?: PeriodUnit;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  periodCount?: number;

  @IsOptional()
  @Validate(DateOnlyConstraint)
  nextChargeDate?: string;

  @IsOptional()
  @IsBoolean()
  isTrial?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  remindDaysBefore?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  notes?: string;
}
