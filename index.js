const axios = require('axios');
const moment = require('moment');
const AWS = require('aws-sdk');

const clientId = "23719554"; 	// me
const LIN = "23719601";
const bookingRoster = [clientId]
const locationId = "14743"; 	// nvbc
const snsTopic = "arn:aws:sns:us-east-1:456270554954:nvbc_notif";
const desiredCounts = ['Court 1', 'Court 6', 'Court 2'];
const desiredTimeSlots = [ { Day: 'Saturday', Time: '2PM'}, {Day: 'Saturday', Time: '3PM'}];

let reservationMap = new Map();

async function findReservationTarget(seeds, slot, court) {
    const maxCall = 128;
    for (let seed of seeds) {
        let reservationIdGuess = seed;
        for (let count = 0; count < maxCall; ++count) {
            if (!reservationMap.has(reservationIdGuess)) {
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
                    // console.error(`error: ${err.statusText}`);
                    console.error(`error: ${err}`);
                    return {id: NaN}
                });
                reservationMap.set(reservationIdGuess, nextCourt);
            }
            let reservationTarget = reservationMap.get(reservationIdGuess);
            if (!isNaN(reservationTarget.id)) {
                let day = moment(reservationTarget.start).format('dddd ha').toLowerCase();
                if (day === `${slot.Day} ${slot.Time}`.toLowerCase() && reservationTarget.resourceName === court) {
                    console.log(`found ${reservationTarget.resourceName} on ${day}`);
                    return reservationTarget;
                } else {
                    console.log(`${reservationIdGuess} is for ${day} on ${reservationTarget.resourceName}`);
                }
            }
            ++reservationIdGuess;
        }
    }
    console.log(`guessed ${maxCall} times, not found`);
    return null;
}

async function isBooked(courtInfo) {
    for (let uid of bookingRoster) {
        let start = moment(courtInfo.start).add(-1, "days").format('YYYY-MM-DD'),
            end = moment(courtInfo.end).add(1, "days").format('YYYY-MM-DD');
        let myReservation = await axios.post('https://nvbc.ezfacility.com/MySchedule/GetBookedReservations',
            `ClientId=${uid}&LocationId=${locationId}&Sunday=true&Monday=true&Tuesday=true&Wednesday=true&Thursday=true&Friday=true&Saturday=true&StartTime=12%3A00+AM&EndTime=12%3A00+AM&ReservationTypes%5B0%5D.Selected=true&ReservationTypes%5B0%5D.Id=-1&ReservationTypes%5B1%5D.Id=201840&ReservationTypes%5B2%5D.Id=201841&ReservationTypes%5B3%5D.Id=201842&ReservationTypes%5B4%5D.Id=201843&ReservationTypes%5B5%5D.Id=203027&ReservationTypes%5B6%5D.Id=203026&ReservationTypes%5B7%5D.Id=215235&ReservationTypes%5B8%5D.Id=201844&ReservationTypes%5B9%5D.Id=222366&ReservationTypes%5B10%5D.Id=222345&ReservationTypes%5B11%5D.Id=222579&ReservationTypes%5B12%5D.Id=222346&ReservationTypes%5B13%5D.Id=209227&ReservationTypes%5B14%5D.Id=225780&ReservationTypes%5B15%5D.Id=201845&ReservationTypes%5B16%5D.Id=225807&ReservationTypes%5B17%5D.Id=201846&ReservationTypes%5B18%5D.Id=222636&ReservationTypes%5B19%5D.Id=222637&ReservationTypes%5B20%5D.Id=222626&ReservationTypes%5B21%5D.Id=222635&Resources%5B0%5D.Selected=true&Resources%5B0%5D.Id=-1&Resources%5B1%5D.Id=300535&Resources%5B2%5D.Id=300536&Resources%5B3%5D.Id=300537&Resources%5B4%5D.Id=300538&Resources%5B5%5D.Id=305799&Resources%5B6%5D.Id=305800&Resources%5B7%5D.Id=305801&Resources%5B8%5D.Id=305802&Resources%5B9%5D.Id=305803&StartDate=${start}&EndDate=${end}`)
            .then(response => {
                return response.data.filter(res => res.id === courtInfo.id);
            });
        if (myReservation.length > 0) {
            return true;
        }
    }
    return false;
}

async function getClientPackage(clientId, reservationTypeId, startTime) {
    let res = await axios.post('https://nvbc.ezfacility.com/Sessions/GetClientPackages', {
        ClientId: clientId,
        LocationId: locationId,
        ReservationTypeId: reservationTypeId,
        ReservationStartDateTime: startTime
    });

    return res.data;
}

async function bookIt(reservationTarget) {
    for (let uid of bookingRoster) {
        try {
            let reservationPackages = await getClientPackage(uid, reservationTarget.reservationTypeId, reservationTarget.start);
            console.log(reservationPackages);
            if (reservationPackages.packages.length > 0) {
                let packageId = reservationPackages.packages[0].Key;
                await axios.post('https://nvbc.ezfacility.com/Sessions/BookClientIntoSession', {
                    ClientId: uid,
                    LocationId: locationId,
                    ReservationId: reservationTarget.id,
                    ReservationTypeId: reservationTarget.reservationTypeId,
                    PackageId: packageId,
                    SelectedPackageId: packageId
                }).then(response => {
                    console.log(response.data);
                });
                return true;
            }
        } catch (e) {
            console.error(`unable to book, likely exceed the limit or booked by someone else. ${e}`);
        }
    }
    return false;
}

function notifySNS(msg) {
    let params = {
        Message: msg,
        TopicArn: snsTopic
    };

    return new AWS.SNS({apiVersion: '2010-03-31'}).publish(params).promise();
}

async function bookNextWeek(startingDate, desiredSlot, desiredCourt) {
    // NVBC website uses EST time, offset UTC-5
    let today = startingDate.clone().utcOffset(-300).format('YYYY-MM-DD'),
        // get next 10 days schedule ...
        sevenDaysFromNow = startingDate.clone().add(7, 'days').utcOffset(-300).format('YYYY-MM-DD');

    console.log(`Attempt to book ${desiredCourt} on ${desiredSlot.Day} ${desiredSlot.Time} in one week from ${today}`);

    // guess the reservation id
    let seedingCourts = await axios.post('https://nvbc.ezfacility.com/Sessions/FilterResults',
        `ClientId=${clientId}&LocationId=${locationId}&Sunday=true&Monday=true&Tuesday=true&Wednesday=true&Thursday=true&Friday=true&Saturday=true&StartTime=12%3A00+AM&EndTime=12%3A00+AM&ReservationTypes%5B0%5D.Selected=true&ReservationTypes%5B0%5D.Id=-1&ReservationTypes%5B1%5D.Id=201840&ReservationTypes%5B2%5D.Id=201841&ReservationTypes%5B3%5D.Id=201842&ReservationTypes%5B4%5D.Id=201843&ReservationTypes%5B5%5D.Id=203027&ReservationTypes%5B6%5D.Id=203026&ReservationTypes%5B7%5D.Id=215235&ReservationTypes%5B8%5D.Id=201844&ReservationTypes%5B9%5D.Id=222366&ReservationTypes%5B10%5D.Id=222345&ReservationTypes%5B11%5D.Id=222579&ReservationTypes%5B12%5D.Id=222346&ReservationTypes%5B13%5D.Id=209227&ReservationTypes%5B14%5D.Id=225780&ReservationTypes%5B15%5D.Id=201845&ReservationTypes%5B16%5D.Id=225807&ReservationTypes%5B17%5D.Id=201846&ReservationTypes%5B18%5D.Id=222636&ReservationTypes%5B19%5D.Id=222637&ReservationTypes%5B20%5D.Id=222626&ReservationTypes%5B21%5D.Id=222635&Resources%5B0%5D.Selected=true&Resources%5B0%5D.Id=-1&Resources%5B1%5D.Id=300535&Resources%5B2%5D.Id=300536&Resources%5B3%5D.Id=300537&Resources%5B4%5D.Id=300538&Resources%5B5%5D.Id=305799&Resources%5B6%5D.Id=305800&Resources%5B7%5D.Id=305801&Resources%5B8%5D.Id=305802&Resources%5B9%5D.Id=305803&StartDate=${today}&EndDate=${sevenDaysFromNow}`)
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
        return false;
    }

    let reservationPossibleIds = seedingCourts.map(c => c.id);

    // find out the reservation id
    let reservationTarget = await findReservationTarget(reservationPossibleIds, desiredSlot, desiredCourt);

    if (!reservationTarget) {
        console.log('cannot find reservation for desired slot');
        return false;
    }

    //check if I've already booked the slot
    let booked = await isBooked(reservationTarget);
    if (booked) {
        console.log("Jim, don't worry, it's already booked.");
        return true;
    }

    //let's book it.
    booked = await bookIt(reservationTarget);
    if (booked) {
        let day = moment(reservationTarget.start).calendar();
        let msg = `Jim, the ${reservationTarget.resourceName} has been booked on ${day}, enjoy!`;
        try {
            await notifySNS(msg);
        } catch (err) {
            console.log(err);
        }
    }
    return booked;
}

exports.handler = async (event) => {
    let today = moment(),
        nextWeek = moment().add(1, 'week');
    for (let startingDate of [today, nextWeek]) {
        for (let slot of desiredTimeSlots) {
            for (let court of desiredCounts) {
                let booked = await bookNextWeek(startingDate, slot, court);
                if (booked) {
                    break;
                }
            }
        }
    }
};
