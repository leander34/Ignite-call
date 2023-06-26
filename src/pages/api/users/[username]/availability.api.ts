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
  const { date } = req.query

  if (!date) {
    return res.status(400).json({
      message: 'Date not provided',
    })
  }

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

  const referenceDate = dayjs(String(date))

  const weekDay = referenceDate.get('day')

  const isPastDate = referenceDate.endOf('day').isBefore(new Date())

  if (isPastDate) {
    return res.json({
      possibleTimes: [],
      availabilityTimes: [],
    })
  }

  const userAvailability = await prisma.userTimeInterval.findFirst({
    where: {
      user_id: user.id,
      week_day: weekDay,
    },
  })

  if (!userAvailability) {
    return res.json({
      possibleTimes: [],
      availabilityTimes: [],
    })
  }

  // eslint-disable-next-line
  const { time_start_in_minutes, time_end_in_minutes } = userAvailability
  // eslint-disable-next-line
  const startHour = time_start_in_minutes / 60 // hora que começa
  // eslint-disable-next-line
  const endHour = time_end_in_minutes / 60 // hora que termina o atendimento

  const possibleTimes = Array.from({ length: endHour - startHour }).map(
    (_, i) => {
      return startHour + i
    },
  )

  const blockedTimes = await prisma.scheduling.findMany({
    where: {
      user_id: user.id,
      date: {
        gte: referenceDate.set('hour', startHour).toDate(),
        lte: referenceDate.set('hour', endHour).toDate(),
      },
    },
    select: {
      date: true,
    },
  })

  const availabilityTimes = possibleTimes.filter((time) => {
    const isTimeBlocked = blockedTimes.some(
      (blockedTime) => blockedTime.date.getHours() === time,
    )
    console.log(isTimeBlocked)

    const isTimeInPast = referenceDate.set('hour', time).isBefore(new Date())
    console.log(isTimeInPast)

    return !isTimeBlocked && !isTimeInPast
  })

  console.log(availabilityTimes)

  return res.json({
    possibleTimes,
    availabilityTimes,
  })
}
