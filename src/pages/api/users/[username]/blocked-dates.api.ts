import { prisma } from '@/lib/prisma'
import dayjs from 'dayjs'
import { NextApiRequest, NextApiResponse } from 'next'

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const method = req.method
  if (method !== 'GET') {
    return res.status(405).end()
  }

  const username = String(req.query.username)
  const { year, month } = req.query

  if (!year || !month) {
    return res.status(400).json({
      message: 'Year or month not specified.',
    })
  }

  // const newMonth = String(month).padStart(2, '0')

  const user = await prisma.user.findUnique({
    where: {
      username,
    },
  })

  if (!user) {
    return res.status(400).json({
      message: 'User does not exists',
    })
  }

  const availibilityWeekDays = await prisma.userTimeInterval.findMany({
    where: {
      user_id: user.id,
    },
    select: {
      week_day: true,
    },
  })

  const blockedWeekDayjs = [0, 1, 2, 3, 4, 5, 6].filter((weekday) => {
    return !availibilityWeekDays.some(
      (availabilityDay) => availabilityDay.week_day === weekday,
    )
  })

  // mysql
  // DATE_FORMAT(S.date, '%Y-%m' = ${`${year}-${month}`})
  // WEEKDAY(DATE_ADD(S.date, INTERVAL 1 DAY))

  // postgress
  // EXTRACT(DOW FROM (S.date + INTERVAL '1 DAY'))
  //
  // const blockedDatesRaw: Array<{ date: number }> = await prisma.$queryRaw`
  // SELECT *
  //   FROM (
  //     SELECT
  //       EXTRACT(DAY FROM S.date) AS date,
  //       COUNT(S.date) AS amount,
  //       ((UTI.time_end_in_minutes - UTI.time_start_in_minutes) / 60) AS size
  //     FROM schedulings AS S
  //     LEFT JOIN user_time_intervals AS UTI
  //       ON UTI.week_day = EXTRACT(DOW FROM S.date)
  //     WHERE S.user_id = ${user.id}
  //       AND TO_CHAR(S.date, 'YYYY-MM') = ${`${year}-${month}`}
  //     GROUP BY EXTRACT(DAY FROM S.date),
  //       ((UTI.time_end_in_minutes - UTI.time_start_in_minutes) / 60)
  //   ) AS subquery
  // WHERE amount >= size
  // `
  //
  const blockedDatesRaw: Array<{ date: number }> = await prisma.$queryRaw`
    SELECT
      EXTRACT(DAY FROM S.DATE) AS date,
      COUNT(S.date) AS amount,
      ((UTI.time_end_in_minutes - UTI.time_start_in_minutes) / 60) AS size

    FROM schedulings S

    LEFT JOIN user_time_intervals UTI
      ON UTI.week_day = WEEKDAY(DATE_ADD(S.date, INTERVAL 1 DAY))

    WHERE S.user_id = ${user.id}
      AND DATE_FORMAT(S.date, "%Y-%m") = ${`${year}-${month}`}

    GROUP BY EXTRACT(DAY FROM S.DATE),
      ((UTI.time_end_in_minutes - UTI.time_start_in_minutes) / 60)

    HAVING amount >= size
  `

  const blockedDates = blockedDatesRaw.map((item) => Number(item.date))

  const todayDate = dayjs()

  const userTimeInterval = await prisma.userTimeInterval.findFirst({
    where: {
      user_id: user.id,
      week_day: todayDate.get('day'),
    },
  })

  const todayDateBlocked: number[] = []
  if (userTimeInterval) {
    const startHour = userTimeInterval.time_start_in_minutes / 60
    const endHour = userTimeInterval.time_end_in_minutes / 60

    const possibleTimes = Array.from({ length: endHour - startHour }).map(
      (_, i) => {
        return startHour + i
      },
    )

    const allPossibleTimesAreInThePast = possibleTimes.every((hour) => {
      return todayDate.set('hour', hour).isBefore(new Date())
    })

    if (allPossibleTimesAreInThePast) {
      todayDateBlocked.push(todayDate.get('date'))
    }
  }

  return res.json({
    availibilityWeekDays,
    blockedWeekDayjs,
    blockedDates,
    todayDateBlocked,
  })
}
