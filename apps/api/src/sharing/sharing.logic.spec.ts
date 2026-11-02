import { displayName, shareKopecks } from './sharing.logic';

describe('доли в общей подписке', () => {
  it('делит поровну с владельцем и округляет вверх до рубля', () => {
    expect(shareKopecks(44900, 2)).toBe(15000); // 449 / 3 = 149,67 → 150
    expect(shareKopecks(30000, 2)).toBe(10000);
    expect(shareKopecks(29900, 1)).toBe(15000); // 149,5 → 150
  });

  it('без участников — вся цена', () => {
    expect(shareKopecks(44900, 0)).toBe(44900);
  });

  it('имя участника', () => {
    expect(displayName({ firstName: 'Петя', username: 'petya' })).toBe('Петя');
    expect(displayName({ firstName: null, username: 'petya' })).toBe('@petya');
    expect(displayName({ firstName: ' ', username: null })).toBe('Участник');
  });
});
