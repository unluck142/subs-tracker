import { validationMessage } from './validation';

const err = (property: string, constraints: Record<string, string>) => ({ property, constraints, children: [] }) as never;

describe('сообщения об ошибках проверки', () => {
  it('понятные тексты для частых полей', () => {
    expect(validationMessage([err('price', { max: 'price must not be greater than 1000000' })])).toContain('до 1 000 000 ₽');
    expect(validationMessage([err('customName', { isLength: 'customName must be longer than or equal to 1 characters' })])).toBe(
      'Название должно быть от 1 до 60 символов',
    );
  });

  it('собственные русские сообщения не трогаем', () => {
    expect(validationMessage([err('nextChargeDate', { dateOnly: 'Дата должна быть в формате ГГГГ-ММ-ДД' })])).toBe(
      'Дата должна быть в формате ГГГГ-ММ-ДД',
    );
  });

  it('остальные поля — по названию', () => {
    expect(validationMessage([err('reminderHour', { max: 'reminderHour must not be greater than 23' })])).toBe(
      'Проверь поле «Во сколько присылать»',
    );
    expect(validationMessage([err('hacker', { whitelistValidation: 'property hacker should not exist' })])).toBe('Лишнее поле: hacker');
  });
});
