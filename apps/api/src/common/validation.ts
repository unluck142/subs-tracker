import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * class-validator пишет ошибки по-английски («price must not be greater than 1000000»),
 * а мини-приложение показывает их пользователю. Переводим в понятный русский текст.
 */
const FIELD_LABELS: Record<string, string> = {
  price: 'Цена',
  customName: 'Название',
  nextChargeDate: 'Следующее списание',
  periodUnit: 'Как часто списывают',
  periodCount: 'Как часто списывают',
  remindDaysBefore: 'Напомнить',
  notes: 'Заметка',
  isTrial: 'Пробный период',
  serviceId: 'Сервис',
  timezone: 'Часовой пояс',
  reminderHour: 'Во сколько присылать',
  reviewsEnabled: 'Спрашивать, пользуюсь ли подписками',
  paid: 'Отметка перевода',
};

const SPECIFIC: Record<string, string> = {
  price: 'Цена должна быть числом от 0 до 1 000 000 ₽ (не больше двух знаков после запятой)',
  customName: 'Название должно быть от 1 до 60 символов',
  notes: 'Заметка — не длиннее 300 символов',
};

export function validationMessage(errors: ValidationError[]): string {
  const first = errors[0];
  if (!first) return 'Некорректные данные';
  const constraints = first.constraints ?? {};
  if (constraints.whitelistValidation) return `Лишнее поле: ${first.property}`;
  // Наши собственные сообщения уже по-русски (например, формат даты)
  const russian = Object.values(constraints).find((m) => /[а-яё]/i.test(m));
  if (russian) return russian;
  if (SPECIFIC[first.property]) return SPECIFIC[first.property];
  const label = FIELD_LABELS[first.property];
  return label ? `Проверь поле «${label}»` : 'Некорректные данные';
}

export function validationExceptionFactory(errors: ValidationError[]) {
  return new BadRequestException(validationMessage(errors));
}
