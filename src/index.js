const axios = require('axios');
const moment = require('moment');

const clientId = "23719554"; 	// me
const locationId = "14743"; 	// nvbc
const packageId = "23989867"; 	// covid-19
const desiredCounts = ['Court 1', 'Court 6', 'Court 2'];
const desiredTimeSlots = [ { Day: 'Saturday', Time: '2PM'}, {Day: 'Saturday', Time: '3PM'}];

async function findReservationTarget(seed, slot, court) {
    const maxCall = 100;
    let reservationIdGuess = seed;
    for (let count = 0; count < maxCall; ++count) {
        console.log(`making a guess reservation id = ${reservationIdGuess}`);
        let nextCourt = await axios.post('https://nvbc.ezfacility.com/Sessions/GetReservationForBooking', {
            ClientId: clientId,
            LocationId: locationId,
            ReservationId: reservationIdGuess
        })
        .then(response => {
            return response.data;
        })
        .catch(err => {
            console.error(err.statusText);
            return { id: NaN }
        });
        if (!isNaN(nextCourt.id)) {
            let day = moment(nextCourt.start).format('dddd ha').toLowerCase();
            console.log(`found ${nextCourt.resourceName} on ${day}`);
            if (day === `${slot.Day} ${slot.Time}`.toLowerCase() && nextCourt.resourceName === court) {
                console.log(`guessed ${count} times.`);
                return nextCourt;
            }
        }
        ++reservationIdGuess;
    }
    console.log(`guessed ${maxCall} times, not found`);
    return null;
}

async function isBooked(courtInfo) {
    let start = moment(courtInfo.start).add(-1, "days").format('YYYY-MM-DD'),
        end = moment(courtInfo.end).add(1, "days").format('YYYY-MM-DD');
    let myReservation = await axios.post('https://nvbc.ezfacility.com/MySchedule/GetBookedReservations',
        `ClientId=${clientId}&LocationId=${locationId}&Sunday=true&Monday=true&Tuesday=true&Wednesday=true&Thursday=true&Friday=true&Saturday=true&StartTime=12%3A00+AM&EndTime=12%3A00+AM&ReservationTypes%5B0%5D.Selected=true&ReservationTypes%5B0%5D.Id=-1&ReservationTypes%5B1%5D.Id=201840&ReservationTypes%5B2%5D.Id=201841&ReservationTypes%5B3%5D.Id=201842&ReservationTypes%5B4%5D.Id=201843&ReservationTypes%5B5%5D.Id=203027&ReservationTypes%5B6%5D.Id=203026&ReservationTypes%5B7%5D.Id=215235&ReservationTypes%5B8%5D.Id=201844&ReservationTypes%5B9%5D.Id=222366&ReservationTypes%5B10%5D.Id=222345&ReservationTypes%5B11%5D.Id=222579&ReservationTypes%5B12%5D.Id=222346&ReservationTypes%5B13%5D.Id=209227&ReservationTypes%5B14%5D.Id=225780&ReservationTypes%5B15%5D.Id=201845&ReservationTypes%5B16%5D.Id=225807&ReservationTypes%5B17%5D.Id=201846&ReservationTypes%5B18%5D.Id=222636&ReservationTypes%5B19%5D.Id=222637&ReservationTypes%5B20%5D.Id=222626&ReservationTypes%5B21%5D.Id=222635&Resources%5B0%5D.Selected=true&Resources%5B0%5D.Id=-1&Resources%5B1%5D.Id=300535&Resources%5B2%5D.Id=300536&Resources%5B3%5D.Id=300537&Resources%5B4%5D.Id=300538&Resources%5B5%5D.Id=305799&Resources%5B6%5D.Id=305800&Resources%5B7%5D.Id=305801&Resources%5B8%5D.Id=305802&Resources%5B9%5D.Id=305803&StartDate=${start}&EndDate=${end}`)
        .then(response => {
            return response.data.filter(res => res.id === courtInfo.id);
        });
    return myReservation.length > 0;
}

async function bookIt(reservationTarget) {
    await axios.post('https://nvbc.ezfacility.com/Sessions/BookClientIntoSession', {
        ClientId: clientId,
        LocationId: locationId,
        ReservationId: reservationTarget.id,
        ReservationTypeId: reservationTarget.reservationTypeId,
        PackageId: packageId,
        SelectedPackageId: packageId
    }).then(response => {
        console.log(response.data);
    })
}

async function bookNextWeek(desiredSlot, desiredCourt) {
    // get next 10 days schedule ...
    let today = moment().format('YYYY-MM-DD'),
        tenDaysFromNow = moment().add(10, 'days').format('YYYY-MM-DD');

    // guess the reservation id
    let seedingCourts = await axios.post('https://nvbc.ezfacility.com/Sessions/FilterResults',
        `ClientId=${clientId}&LocationId=${locationId}&Sunday=true&Monday=true&Tuesday=true&Wednesday=true&Thursday=true&Friday=true&Saturday=true&StartTime=12%3A00+AM&EndTime=12%3A00+AM&ReservationTypes%5B0%5D.Selected=true&ReservationTypes%5B0%5D.Id=-1&ReservationTypes%5B1%5D.Id=201840&ReservationTypes%5B2%5D.Id=201841&ReservationTypes%5B3%5D.Id=201842&ReservationTypes%5B4%5D.Id=201843&ReservationTypes%5B5%5D.Id=203027&ReservationTypes%5B6%5D.Id=203026&ReservationTypes%5B7%5D.Id=215235&ReservationTypes%5B8%5D.Id=201844&ReservationTypes%5B9%5D.Id=222366&ReservationTypes%5B10%5D.Id=222345&ReservationTypes%5B11%5D.Id=222579&ReservationTypes%5B12%5D.Id=222346&ReservationTypes%5B13%5D.Id=209227&ReservationTypes%5B14%5D.Id=225780&ReservationTypes%5B15%5D.Id=201845&ReservationTypes%5B16%5D.Id=225807&ReservationTypes%5B17%5D.Id=201846&ReservationTypes%5B18%5D.Id=222636&ReservationTypes%5B19%5D.Id=222637&ReservationTypes%5B20%5D.Id=222626&ReservationTypes%5B21%5D.Id=222635&Resources%5B0%5D.Selected=true&Resources%5B0%5D.Id=-1&Resources%5B1%5D.Id=300535&Resources%5B2%5D.Id=300536&Resources%5B3%5D.Id=300537&Resources%5B4%5D.Id=300538&Resources%5B5%5D.Id=305799&Resources%5B6%5D.Id=305800&Resources%5B7%5D.Id=305801&Resources%5B8%5D.Id=305802&Resources%5B9%5D.Id=305803&StartDate=${today}&EndDate=${tenDaysFromNow}`)
        .then(response => {
            return response.data.filter(d => {
                let day = moment(d.start).format('dddd');
                if (day.toLowerCase() === desiredSlot.Day.toLowerCase()) {
                    return true;
                }
                return false;
            }).sort((ct1, ct2) => ct1.start - ct2.start);
        });

    if (seedingCourts.length === 0) {
        console.log("cannot find any desired courts for seeding");
        return;
    }

    let reservationSeed = seedingCourts[0].id;

    // find out the reservation id
    let reservationTarget = await findReservationTarget(reservationSeed, desiredSlot, desiredCourt);

    if (!reservationTarget) {
        console.log('cannot find reservation for desired slot');
        return;
    }

    //check if I've already booked the slot
    let booked = await isBooked(reservationTarget);
    if (booked) {
        console.log("don't worry, it's already booked.");
        return;
    }

    //let's book it.
    try {
        await bookIt(reservationTarget);
        let day = moment(reservationTarget.start).calendar();
        console.log(`Jim, the ${reservationTarget.resourceName} has been booked on ${day}, enjoy!`);
    } catch (err) {
        console.log('Unable to book, probably already booked by someone else.')
    }
}

bookNextWeek({ Day: 'Saturday', Time: '2PM'}, 'Court 1');
bookNextWeek({ Day: 'Monday', Time: '1PM'}, 'Court 6');
