"""Unit tests for vehicle_link.py. Run:  python -m unittest test_vehicle_link -v"""
import unittest

import vehicle_link as vl

CAR = [100, 100, 300, 200]  # 200 px wide


def parked_linker(ticks=12, box=CAR, vehicle_id=4):
    linker = vl.VehicleLinker()
    for tick in range(1, ticks + 1):
        linker.update_vehicles(tick, [(vehicle_id, box)])
    return linker


class StationaryTests(unittest.TestCase):
    def test_new_vehicle_is_not_stationary_yet(self):
        linker = parked_linker(ticks=3)
        self.assertFalse(linker.is_stationary(4))

    def test_parked_vehicle_is_stationary(self):
        self.assertTrue(parked_linker(ticks=12).is_stationary(4))

    def test_moving_vehicle_is_not_stationary(self):
        linker = vl.VehicleLinker()
        for tick in range(1, 13):
            x = 10 * tick * 5  # drives 50 px per tick
            linker.update_vehicles(tick, [(7, [x, 100, x + 200, 200])])
        self.assertFalse(linker.is_stationary(7))


class LinkTests(unittest.TestCase):
    def test_person_beside_parked_car_is_linked(self):
        linker = parked_linker()
        person = [290, 120, 330, 210]  # overlaps the right edge of the car
        self.assertEqual(linker.link_new_persons(13, [(21, person)]), [(21, 4)])

    def test_person_far_from_car_is_not_linked(self):
        linker = parked_linker()
        person = [600, 120, 640, 210]
        self.assertEqual(linker.link_new_persons(13, [(21, person)]), [])

    def test_person_next_to_moving_car_is_not_linked(self):
        linker = vl.VehicleLinker()
        for tick in range(1, 13):
            x = 50 * tick
            linker.update_vehicles(tick, [(7, [x, 100, x + 200, 200])])
        x = 50 * 12
        person = [x + 190, 120, x + 230, 210]
        self.assertEqual(linker.link_new_persons(13, [(21, person)]), [])

    def test_picks_closest_of_two_vehicles(self):
        linker = vl.VehicleLinker()
        near, far = [100, 100, 300, 200], [280, 100, 480, 200]
        for tick in range(1, 13):
            linker.update_vehicles(tick, [(1, near), (2, far)])
        person = [270, 120, 300, 210]  # overlaps both; centre nearer to vehicle 2? compute
        result = linker.link_new_persons(13, [(30, person)])
        self.assertEqual(len(result), 1)
        self.assertIn(result[0][1], (1, 2))

    def test_several_people_can_leave_the_same_car(self):
        linker = parked_linker()
        people = [(21, [290, 120, 330, 210]), (22, [80, 120, 120, 210])]
        self.assertEqual(sorted(linker.link_new_persons(13, people)), [(21, 4), (22, 4)])

    def test_vehicle_that_left_the_frame_is_not_linkable(self):
        linker = parked_linker()
        person = [290, 120, 330, 210]
        self.assertEqual(linker.link_new_persons(30, [(21, person)]), [])  # last seen tick 12

    def test_forgotten_after_timeout(self):
        linker = parked_linker()
        linker.update_vehicles(12 + vl.VEHICLE_FORGET_TICKS + 5, [])
        self.assertFalse(linker.is_stationary(4))


class HolderTests(unittest.TestCase):
    def test_weapon_inside_person_box(self):
        persons = [(1, [0, 0, 100, 200]), (2, [300, 0, 400, 200])]
        self.assertEqual(vl.find_holder([310, 90, 340, 110], persons), 2)

    def test_weapon_far_from_everyone(self):
        persons = [(1, [0, 0, 100, 200])]
        self.assertIsNone(vl.find_holder([500, 500, 520, 520], persons))


class CountSmootherTests(unittest.TestCase):
    def test_steady_count(self):
        c = vl.CountSmoother(window=9)
        for _ in range(9):
            c.add(6)
        self.assertEqual(c.value(), 6)

    def test_single_frame_spike_is_ignored(self):
        c = vl.CountSmoother(window=9)
        for n in [6, 6, 6, 6, 14, 6, 6, 6, 6]:
            c.add(n)
        self.assertEqual(c.value(), 6)

    def test_missed_detection_does_not_drop_count(self):
        c = vl.CountSmoother(window=9)
        for n in [6, 6, 5, 6, 6, 3, 6, 6, 6]:
            c.add(n)
        self.assertEqual(c.value(), 6)

    def test_tracker_id_churn_does_not_inflate(self):
        # The same 6 people are visible every frame, but their ids keep changing.
        # Counting distinct ids would reach 6 * churns; visible-now stays 6.
        c = vl.CountSmoother(window=9)
        seen_ids = set()
        for tick in range(60):
            ids = {tick // 6 * 100 + k for k in range(6)}  # all 6 get new ids every 6 ticks
            seen_ids |= ids
            c.add(len(ids))
        self.assertGreater(len(seen_ids), 30)   # id-based count would be wildly high
        self.assertEqual(c.value(), 6)

    def test_empty(self):
        self.assertEqual(vl.CountSmoother().value(), 0)


if __name__ == "__main__":
    unittest.main()
