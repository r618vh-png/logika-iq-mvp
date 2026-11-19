// Stable option codes are validated on the server. Store the wording with each answer.
export function exitQuestion(number,reason,usedOffer=false){
  let title,options,offer=null;
  if(number===2 || number===5){
    if(usedOffer){
      [title,options]=number===2
        ? ['Успели воспользоваться предыдущим предложением?', {yes:'Да, успел попробовать',no:'Ещё нет'}]
        : ['Как вам подошли условия прошлого предложения?', {good:'Подошли',partial:'Частично',poor:'Не подошли',unknown:'Пока не знаю'}];
    } else {
      const discountFirst=reason==='price';
      offer=(number===2)===discountFirst?'discount':'pause';
      [title,options]=offer==='discount'
        ? ['Оставить подписку на месяц за 149 ₽?', {discount:'Да, оставить за 149 ₽',continue:'Нет, продолжить отмену'}]
        : ['Взять паузу в тренировках на 30 дней?', {pause:'Да, взять паузу',continue:'Нет, продолжить отмену'}];
    }
  } else {
    [title,options]={
      1:['Почему хотите отменить подписку?',{price:'Для меня дорого',time:'Сейчас нет времени'}],
      3:['Зачем вы проходили тест?',{score:'Узнать свой балл',skills:'Понять свои сильные стороны',practice:'Попробовать тренировки'}],
      4:['Сколько времени удобно уделять одной тренировке?',{short:'До 3 минут',medium:'5–10 минут',long:'Больше 10 минут',none:'Тренировки мне не нужны'}],
      6:['Как вам сложность задач?',{easy:'Слишком легко',right:'В самый раз',hard:'Слишком сложно'}],
      7:['Какие задачи понравились больше?',{numbers:'Числовые ряды',shapes:'Фигуры',logic:'Задачи на логику',none:'Нет предпочтения'}],
      8:['Насколько понятны объяснения в разборе?',{clear:'Всё понятно',partial:'Часть решений стоит пояснить',unseen:'Пока не читал разбор'}],
      9:['Какой формат доступа вам удобнее?',{once:'Купить один разбор',monthly:'Подписка на тренировки',free:'Только бесплатный тест'}],
      10:['Отключить автопродление?',{cancel:'Да, отменить продление',keep:'Нет, оставить подписку'}]
    }[number];
  }
  return {number,title,options,offer};
}

// Stable identifiers also label historical decisions in the dashboard.
export const renewalOffers = [
  ['month149','Месяц за 149 ₽','Останьтесь на месяц за 149 ₽','Оставить месяц за 149 ₽'],
  ['pause30','Пауза на 30 дней','Возьмите паузу на 30 дней','Поставить подписку на паузу'],
  ['practice','Персональные задачи','Получите тренировку по своему результату','Подключить персональные задачи'],
  ['month99','Месяц за 99 ₽','Снизим цену следующего месяца до 99 ₽','Оставить месяц за 99 ₽'],
  ['duo','Доступ для двоих','Подарите близкому тест с полным разбором','Получить приглашение'],
  ['daily','Задача дня','Открывайте по одной задаче каждый день','Подключить задачу дня'],
  ['retest','Повторный тест','Сравните свой результат через неделю','Добавить повторный тест'],
  ['bonus','Семь дней в подарок','Добавим неделю к вашему доступу','Получить 7 дней'],
  ['advanced','Три задачи повышенной сложности','Попробуйте три задачи посложнее','Открыть сложные задачи'],
  ['fortnight','Две недели в подарок','Продлим доступ на две недели за наш счёт','Получить 14 дней']
];
export function renewalScreen(number,claimed={},price=299) {
  const decline='Всё равно отменить';
  const [code,label,title,accept]=renewalOffers[number-1];
  if(Object.hasOwn(claimed,code) || (code==='month149' && price<149)){
    return {number,title:'Сохраните действующие условия',existing:label,options:{keep:'Оставить подписку',[number===10?'cancel':'continue']:decline}};
  }
  return {number,title,offer:code,options:{[code]:accept,[number===10?'cancel':'continue']:decline}};
}
