import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { Bell, CalendarDays, ChevronDown, Heart, Home, HousePlus, LogOut, Menu, MessageCircle, Search, UserRound, X, MapPin, Star, Users } from 'lucide-react'
import './App.css'

const images = [
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=85',
  'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=900&q=85',
]
const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
const formatDateTime = (value) => value
  ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  : ''
const averageRating = (reviews = []) => reviews.length
  ? (reviews.reduce((total, review) => total + review.rating, 0) / reviews.length).toFixed(1)
  : null
const toDateTimeInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}


const API_URL = import.meta.env.VITE_API_URL || ''

function api(path, options = {}) {
  const token = localStorage.getItem('airbnb_token')
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Something went wrong')
    return body
  })
}


function Header({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  return (
    <header className="header">
      <Link className="brand" to="/" aria-label="Staybnb home"><span className="brand-mark"><Home size={20} fill="currentColor" /></span><span>Staybnb</span></Link>
      <nav className={open ? 'nav nav-open' : 'nav'}>
        <Link to="/" onClick={() => setOpen(false)}>Explore</Link>
        {user?.role === 'host' && <Link to="/host" onClick={() => setOpen(false)}>Host a home</Link>}
        {user && <Link to="/trips" onClick={() => setOpen(false)}>Trips</Link>}
        {user && <Link to="/dashboard" onClick={() => setOpen(false)}><Bell size={18} /><span className="nav-label">Notifications</span></Link>}
        {!user ? (
          <div className="auth-links">
            <Link className="login-link" to="/login" onClick={() => setOpen(false)}>Log in</Link>
            <Link className="signup-link" to="/register" onClick={() => setOpen(false)}>Sign up</Link>
          </div>
        ) : (
          <button className="profile-button" type="button" onClick={onLogout} title="Log out"><span className="avatar">{user.name?.[0]?.toUpperCase() || 'U'}</span><span>{user.name}</span><LogOut size={16} /></button>
        )}
      </nav>
      <button className="menu-button" type="button" onClick={() => setOpen(!open)} aria-label="Toggle menu">{open ? <X /> : <Menu />}</button>
    </header>
  )
}

function SearchBar({ onSearch }) {
  const [form, setForm] = useState({ city: '', checkIn: '', checkOut: '', guests: '' })
  const update = (key, value) => setForm((old) => ({ ...old, [key]: value }))
  return (
    <form className="search-bar" onSubmit={(event) => { event.preventDefault(); onSearch(form) }}>
      <label><span>Where</span><input value={form.city} onChange={(e) => update('city', e.target.value)} placeholder="Search destinations" /></label>
      <label><span>Check in</span><input type="datetime-local" value={form.checkIn} onChange={(e) => update('checkIn', e.target.value)} /></label>
      <label><span>Check out</span><input type="datetime-local" value={form.checkOut} onChange={(e) => update('checkOut', e.target.value)} /></label>
      <label><span>Guests</span><select value={form.guests} onChange={(e) => update('guests', e.target.value)}><option value="">Add guests</option>{[1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n} guest{n > 1 ? 's' : ''}</option>)}</select></label>
      <button className="search-button" type="submit" aria-label="Search"><Search size={20} /></button>
    </form>
  )
}

function ListingCard({ listing, index }) {
  const [liked, setLiked] = useState(false)
  return (
    <article className="listing-card">
      <div className="listing-image-wrap">
        <Link to={`/listing/${listing._id}`}><img src={listing.images?.[0] || images[index % images.length]} alt={listing.title} /></Link>
        <button className={liked ? 'heart liked' : 'heart'} type="button" onClick={() => setLiked(!liked)} aria-label="Save listing"><Heart size={20} fill={liked ? 'currentColor' : 'none'} /></button>
      </div>
      <Link to={`/listing/${listing._id}`} className="listing-content">
        <div className="listing-top"><h3>{listing.address.city}, {listing.address.country}</h3>{listing.reviews?.length > 0 && <span><Star size={14} fill="currentColor" /> {averageRating(listing.reviews)} ({listing.reviews.length})</span>}</div>
        <p>{listing.title}</p>
        {(listing.availableFrom || listing.availableUntil) && <p className="listing-availability">{listing.availableFrom ? formatDateTime(listing.availableFrom) : 'Available now'} – {listing.availableUntil ? formatDateTime(listing.availableUntil) : 'Open ended'}</p>}
        <p className="price"><strong>{money(listing.pricePerNight)}</strong> night</p>
      </Link>
    </article>
  )
}

function HomePage() {
  const navigate = useNavigate()
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  async function load(params = {}) {
    setLoading(true); setError('')
    try {
      const query = new URLSearchParams()
      if (params.city) query.set('city', params.city)
      if (params.guests) query.set('guests', params.guests)
      if (params.checkIn) query.set('checkIn', new Date(params.checkIn).toISOString())
      if (params.checkOut) query.set('checkOut', new Date(params.checkOut).toISOString())
      setListings(await api(`/api/listings${query.size ? `?${query}` : ''}`))
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  return (
    <main>
      <section className="hero-section">
        <div className="hero-copy"><span className="eyebrow">Homes worth traveling for</span><h1>Find your next <em>favorite place</em></h1><p>Unique stays, warm hosts, and unforgettable destinations.</p></div>
        <SearchBar onSearch={load} />
      </section>
      <section className="explore-section">
        <div className="section-heading"><div><span className="eyebrow">Explore stays</span><h2>Homes guests love</h2></div><button type="button" onClick={() => load()}><span>View all</span><ChevronDown size={16} /></button></div>
        {loading ? <div className="grid-state"><div className="spinner" /></div> : error ? <div className="empty-state">{error}</div> : listings.length ? <div className="listing-grid">{listings.map((listing, i) => <ListingCard key={listing._id} listing={listing} index={i} />)}</div> : <div className="empty-state">No stays found. Try another city or remove the guest filter.</div>}
      </section>
      <section className="cta-section"><div><span className="eyebrow">Become a host</span><h2>Share your space.<br />Welcome the world.</h2></div><button type="button" onClick={() => navigate('/host')}>List your home</button></section>
    </main>
  )
}

function AuthPage({ mode, setUser }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'guest' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const isLogin = mode === 'login'
  const [loginRole, setLoginRole] = useState('guest')
  const update = (key, value) => setForm((old) => ({ ...old, [key]: value }))
  async function submit(event) {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const body = await api(`/api/auth/${isLogin ? 'login' : 'register'}`, { method: 'POST', body: JSON.stringify(isLogin ? { email: form.email, password: form.password, role: loginRole } : form) })
      localStorage.setItem('airbnb_token', body.token); localStorage.setItem('airbnb_user', JSON.stringify(body.user)); setUser(body.user)
      navigate(body.user.role === 'host' ? '/host' : '/')
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }
  return (
    <main className="auth-page"><section className="auth-card">
      <div className="auth-heading"><Link className="brand" to="/"><span className="brand-mark"><Home size={20} fill="currentColor" /></span><span>Staybnb</span></Link><h1>{isLogin ? 'Welcome back' : 'Create your account'}</h1><p>{isLogin ? 'Log in to manage your trips and stays.' : 'Join Staybnb to explore or share amazing homes.'}</p></div>
      <form onSubmit={submit} className="auth-form">
        {isLogin && <div className="role-toggle" aria-label="Choose account type"><button type="button" className={loginRole === 'guest' ? 'active' : ''} onClick={() => setLoginRole('guest')}>Guest</button><button type="button" className={loginRole === 'host' ? 'active' : ''} onClick={() => setLoginRole('host')}>Host</button></div>}
        {!isLogin && <label>Full name<input required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Taylor Morgan" /></label>}
        <label>Email<input required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@example.com" /></label>
        <label>Password<input required minLength={isLogin ? 1 : 8} type="password" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="At least 8 characters" /></label>
        {!isLogin && <label>Account type<select value={form.role} onChange={(e) => update('role', e.target.value)}><option value="guest">Guest - Book stays</option><option value="host">Host - List a home</option></select></label>}
        {error && <div className="form-error">{error}</div>}<button className="primary-button" type="submit" disabled={loading}>{loading ? 'Please wait...' : isLogin ? 'Log in' : 'Create account'}</button>
      </form>
      <p className="auth-switch">{isLogin ? 'New to Staybnb?' : 'Already have an account?'} <Link to={isLogin ? '/register' : '/login'}>{isLogin ? 'Sign up' : 'Log in'}</Link></p>
    </section></main>
  )
}

function ListingPage({ user }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [listing, setListing] = useState(null)
  const [error, setError] = useState('')
  const [dates, setDates] = useState({ checkIn: '', checkOut: '', guests: 1, rooms: 1 })
  const [booking, setBooking] = useState(null)
  const [availability, setAvailability] = useState(null)
  const [availabilityError, setAvailabilityError] = useState('')
  const [availabilityLoading, setAvailabilityLoading] = useState(false)

  useEffect(() => {
    api(`/api/listings/${id}`).then(setListing).catch((err) => setError(err.message))
  }, [id])

  useEffect(() => {
    if (!listing || !dates.checkIn || !dates.checkOut) {
      setAvailability(null)
      setAvailabilityError('')
      setAvailabilityLoading(false)
      return
    }
    const start = new Date(dates.checkIn)
    const end = new Date(dates.checkOut)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setAvailability(null)
      setAvailabilityError('Check-out must be later than check-in.')
      setAvailabilityLoading(false)
      return
    }

    let active = true
    const query = new URLSearchParams({
      listingId: listing._id,
      checkIn: start.toISOString(),
      checkOut: end.toISOString(),
    })
    setAvailability(null)
    setAvailabilityError('')
    setAvailabilityLoading(true)
    api(`/api/bookings/availability?${query}`)
      .then((result) => {
        if (active) setAvailability(result)
      })
      .catch((err) => {
        if (active) setAvailabilityError(err.message)
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false)
      })
    return () => { active = false }
  }, [listing, dates.checkIn, dates.checkOut])

  useEffect(() => {
    if (availability && availability.availableRooms > 0 && Number(dates.rooms) > availability.availableRooms) {
      setDates((current) => ({ ...current, rooms: availability.availableRooms }))
    }
  }, [availability, dates.rooms])

  async function reserve(event) {
    event.preventDefault()
    if (!user) return navigate('/login')
    setError('')
    try {
      setBooking(await api('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          listingId: id,
          checkIn: new Date(dates.checkIn).toISOString(),
          checkOut: new Date(dates.checkOut).toISOString(),
          guestCount: Number(dates.guests),
          roomCount: Number(dates.rooms),
        }),
      }))
    } catch (err) { setError(err.message) }
  }

  if (error && !listing) return <main className="page-state"><div className="empty-state">{error}</div></main>
  if (!listing) return <main className="page-state"><div className="spinner" /></main>
  const nights = dates.checkIn && dates.checkOut
    ? Math.max(1, Math.ceil((new Date(dates.checkOut) - new Date(dates.checkIn)) / 86400000))
    : 0
  const roomCapacity = Number(listing.roomCount || 1)
  const availableRooms = dates.checkIn && dates.checkOut
    ? availability?.availableRooms || 0
    : roomCapacity
  const reviews = listing.reviews || []

  return (
    <main className="detail-page">
      <div className="detail-heading">
        <span className="eyebrow">{listing.address.city}, {listing.address.country}</span>
        <h1>{listing.title}</h1>
        <p>{reviews.length > 0 && <><Star size={15} fill="currentColor" /> {averageRating(reviews)} · {reviews.length} review{reviews.length === 1 ? '' : 's'} · </>}<MapPin size={15} /> {listing.address.street}</p>
      </div>
      <div className="detail-gallery"><img className="gallery-main" src={listing.images?.[0] || images[0]} alt={listing.title} /><div className="gallery-side"><img src={listing.images?.[1] || images[1]} alt="" /><img src={listing.images?.[2] || images[2]} alt="" /></div></div>
      <div className="detail-layout">
        <section className="detail-copy">
          <h2>Entire home hosted by a verified host</h2>
          <div className="amenities-row"><span><Users size={18} /> Up to {listing.maxGuests} guests</span><span><Home size={18} /> {roomCapacity} room{roomCapacity === 1 ? '' : 's'}</span><span><CalendarDays size={18} /> Flexible dates</span></div>
          {(listing.availableFrom || listing.availableUntil) && <div className="availability-window"><h3>Available booking window</h3><p>{listing.availableFrom ? formatDateTime(listing.availableFrom) : 'Available now'}<br /><span>through</span><br />{listing.availableUntil ? formatDateTime(listing.availableUntil) : 'Open ended'}</p></div>}
          <hr /><h3>About this place</h3><p>{listing.description}</p>
          {reviews.length > 0 && <section className="listing-reviews"><h3>Guest reviews · {averageRating(reviews)}</h3>{reviews.map((review) => <article key={review._id}><strong><Star size={14} fill="currentColor" /> {review.rating}/5</strong>{review.comment && <p>{review.comment}</p>}</article>)}</section>}
        </section>
        <aside className="booking-card">{booking ? <div className="booking-success"><span className="success-mark">✓</span><h3>Booking reserved</h3><p>Continue to secure payment for this stay.</p><Link className="primary-button" to={`/checkout/${booking._id}`}>Continue to payment</Link></div> : <form onSubmit={reserve}>
          <div className="booking-price"><strong>{money(listing.pricePerNight)}</strong><span> night</span></div>
          {(listing.availableFrom || listing.availableUntil) && <p className="availability-note">Select a stay within the host's available date and time window.</p>}
          <div className="date-grid">
            <label>Check in<input required type="datetime-local" min={toDateTimeInput(listing.availableFrom)} max={toDateTimeInput(listing.availableUntil)} value={dates.checkIn} onChange={(e) => setDates({ ...dates, checkIn: e.target.value, checkOut: dates.checkOut && dates.checkOut < e.target.value ? '' : dates.checkOut })} /></label>
            <label>Check out<input required type="datetime-local" min={dates.checkIn || toDateTimeInput(listing.availableFrom)} max={toDateTimeInput(listing.availableUntil)} value={dates.checkOut} onChange={(e) => setDates({ ...dates, checkOut: e.target.value })} /></label>
          </div>
          <label className="guest-field">Guests<select value={dates.guests} onChange={(e) => setDates({ ...dates, guests: e.target.value })}>{Array.from({ length: listing.maxGuests }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} guest{n > 1 ? 's' : ''}</option>)}</select></label>
          <label className="guest-field">Rooms<select value={availableRooms ? Math.min(Number(dates.rooms), availableRooms) : 0} onChange={(e) => setDates({ ...dates, rooms: e.target.value })} disabled={availabilityLoading || availableRooms === 0}>
            {availableRooms > 0 ? Array.from({ length: availableRooms }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} room{n === 1 ? '' : 's'}</option>) : <option value="0">No rooms available</option>}
          </select></label>
          {availabilityLoading && <p className="availability-note">Checking room availability…</p>}
          {availabilityError && <div className="form-error">{availabilityError}</div>}
          {dates.checkIn && dates.checkOut && availability && <p className="availability-note">{availability.withinWindow ? `${availability.availableRooms} room(s) available for these times.` : 'These times are outside the host’s availability window.'}</p>}
          {nights > 0 && availableRooms > 0 && <div className="booking-total"><span>{money(listing.pricePerNight)} × {nights} nights × {Math.min(Number(dates.rooms), availableRooms)} room(s)</span><strong>{money(listing.pricePerNight * nights * Math.min(Number(dates.rooms), availableRooms))}</strong></div>}
          {error && <div className="form-error">{error}</div>}
          <button className="reserve-button" type="submit" disabled={availabilityLoading || availableRooms === 0 || Boolean(availabilityError)}>{user ? 'Reserve' : 'Log in to reserve'}</button><p className="booking-note">You won't be charged yet</p>
        </form>}</aside>
      </div>
    </main>
  )
}

function TripsPage({ user }) {
  const [bookings, setBookings] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [earlyCheckoutId, setEarlyCheckoutId] = useState(null)
  const [newCheckOut, setNewCheckOut] = useState('')
  const [reviewingId, setReviewingId] = useState(null)
  const [rating, setRating] = useState('5')
  const [comment, setComment] = useState('')

  useEffect(() => {
    api('/api/bookings')
      .then(async (items) => Promise.all(items.map(async (booking) => {
        try {
          const listing = await api(`/api/listings/${booking.listingId}`)
          return { ...booking, listing }
        } catch {
          return { ...booking, listingError: err.message }
        }
      })))
      .then(setBookings)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function changeStatus(id, status) {
    try {
      const updated = await api(`/api/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setBookings((items) => items.map((item) => item._id === updated._id ? { ...item, ...updated } : item))
    } catch (err) { setError(err.message) }
  }

  async function shortenStay(event, booking) {
    event.preventDefault()
    setError('')
    try {
      const updated = await api(`/api/bookings/${booking._id}/early-checkout`, {
        method: 'PATCH',
        body: JSON.stringify({ checkOut: new Date(newCheckOut).toISOString() }),
      })
      setBookings((items) => items.map((item) => item._id === updated._id ? { ...item, ...updated } : item))
      setEarlyCheckoutId(null)
      setNewCheckOut('')
    } catch (err) { setError(err.message) }
  }

  async function submitReview(event, booking) {
    event.preventDefault()
    setError('')
    try {
      const review = await api(`/api/listings/${booking.listingId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ bookingId: booking._id, rating: Number(rating), comment }),
      })
      setBookings((items) => items.map((item) => item._id === booking._id
        ? { ...item, listing: { ...item.listing, reviews: [...(item.listing?.reviews || []), review] } }
        : item))
      setReviewingId(null)
      setRating('5')
      setComment('')
    } catch (err) { setError(err.message) }
  }

  return (
    <main className="content-page">
      <div className="page-heading"><span className="eyebrow">Your account</span><h1>Trips</h1></div>
      {error && <div className="form-error">{error}</div>}
      {loading ? <div className="spinner" /> : bookings.length ? (
        <div className="booking-list">
          {bookings.map((booking) => {
            const guestOwnsBooking = String(booking.guestId) === String(user?.id)
            const alreadyReviewed = booking.listing?.reviews?.some((review) => review.bookingId === booking._id)
            const checkedOut = new Date(booking.checkOut) <= new Date()
            return (
              <article className="booking-row booking-row-expanded" key={booking._id}>
                <div className="booking-row-icon"><CalendarDays /></div>
                <div className="booking-row-copy">
                  <h3>{booking.listing?.title || 'Your stay'}</h3>
                  {booking.listingError && <p className="listing-load-error">Listing details unavailable: {booking.listingError}</p>}
                  <p>{formatDateTime(booking.checkIn)} — {formatDateTime(booking.checkOut)}</p>
                  <p>{booking.guestCount} guests · {booking.roomCount || 1} room(s) · {money(booking.totalPrice)}</p>
                  {booking.originalCheckOut && <p className="early-checkout-note">Stay shortened. If already paid, your original payment is not automatically refunded.</p>}
                </div>
                <span className={`status status-${booking.status}`}>{booking.status}</span>
                {booking.status !== 'cancelled' && <button type="button" onClick={() => changeStatus(booking._id, 'cancelled')}>Cancel</button>}
                {guestOwnsBooking && booking.status !== 'cancelled' && !checkedOut && (
                  <div className="trip-actions">
                    {earlyCheckoutId === booking._id ? (
                      <form className="early-checkout-form" onSubmit={(event) => shortenStay(event, booking)}>
                        <label>New earlier checkout<input required type="datetime-local" min={toDateTimeInput(booking.checkIn)} max={toDateTimeInput(booking.checkOut)} value={newCheckOut} onChange={(event) => setNewCheckOut(event.target.value)} /></label>
                        <p>The stay total will be recalculated. No automatic refund will be issued for payments already made.</p>
                        <button className="primary-button" type="submit" disabled={!newCheckOut}>Save earlier checkout</button>
                        <button type="button" onClick={() => setEarlyCheckoutId(null)}>Keep current checkout</button>
                      </form>
                    ) : <button type="button" onClick={() => { setEarlyCheckoutId(booking._id); setNewCheckOut('') }}>Change checkout earlier</button>}
                  </div>
                )}
                {guestOwnsBooking && checkedOut && booking.status !== 'cancelled' && booking.listing && (
                  <div className="trip-review">
                    {alreadyReviewed ? <p>You rated this stay {booking.listing.reviews.find((review) => review.bookingId === booking._id)?.rating}/5.</p>
                      : reviewingId === booking._id ? (
                        <form onSubmit={(event) => submitReview(event, booking)}>
                          <label>Your rating<select value={rating} onChange={(event) => setRating(event.target.value)}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
                          <label>Comment (optional)<textarea rows={3} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
                          <button className="primary-button" type="submit">Submit review</button>
                        </form>
                      ) : <button type="button" onClick={() => setReviewingId(booking._id)}>Rate this stay</button>}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      ) : <div className="empty-state"><HousePlus size={32} /><h3>No trips yet</h3><p>When you reserve a stay, it will appear here.</p><Link className="primary-button" to="/">Explore homes</Link></div>}
    </main>
  )
}

function CheckoutPage({ user }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [booking, setBooking] = useState(null)
  const [listing, setListing] = useState(null)
  const [payment, setPayment] = useState(null)
  const [config, setConfig] = useState({ keyId: '', enabled: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api(`/api/bookings/${id}`), api('/api/payments/config')])
      .then(async ([bookingData, configData]) => {
        setBooking(bookingData)
        setConfig(configData)
        setListing(await api(`/api/listings/${bookingData.listingId}`))
        setPayment(await api('/api/payments', { method: 'POST', body: JSON.stringify({ bookingId: bookingData._id }) }))
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  async function completePayment(providerPaymentId, providerOrderId, providerSignature) {
    try {
      const paid = await api(`/api/payments/${payment._id}/complete`, {
        method: 'PATCH',
        body: JSON.stringify({ providerPaymentId, providerOrderId, providerSignature }),
      })
      navigate(`/booking/${booking._id}?payment=${paid._id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  function pay() {
    if (!payment) return
    if (!config.enabled) {
      completePayment(`demo_${Date.now()}`)
      return
    }
    if (!window.Razorpay) {
      setError('Razorpay checkout could not load. Check your internet connection.')
      return
    }
    api('/api/payments/order', { method: 'POST', body: JSON.stringify({ paymentId: payment._id }) }).then((orderData) => {
      const checkout = new window.Razorpay({
        key: config.keyId,
        order_id: orderData.orderId,
        amount: Math.round(booking.totalPrice * 100),
        currency: 'INR',
        name: 'Staybnb',
        description: listing?.title || 'Staybnb booking',
        handler: (response) => completePayment(
          response.razorpay_payment_id,
          response.razorpay_order_id,
          response.razorpay_signature,
        ),
        prefill: { name: user?.name || '', email: user?.email || '' },
        theme: { color: '#ef5b4c' },
      })
      checkout.open()
    }).catch((err) => {
      setError(err.message)
    })
  }

  useEffect(() => {
    if (config.enabled && !document.querySelector('script[data-razorpay]')) {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.dataset.razorpay = 'true'
      document.head.appendChild(script)
    }
  }, [config.enabled])

  if (loading) return <main className="page-state"><div className="spinner" /></main>
  if (error && !booking) return <main className="page-state"><div className="empty-state">{error}</div></main>
  return (
    <main className="content-page checkout-page">
      <div className="page-heading"><span className="eyebrow">Secure checkout</span><h1>Complete your booking</h1></div>
      <div className="checkout-grid">
        <section className="checkout-summary">
          <img src={listing?.images?.[0] || images[0]} alt={listing?.title || 'Stay'} />
          <div><span className="eyebrow">Your stay</span><h2>{listing?.title}</h2><p>{listing?.address?.city}, {listing?.address?.country}</p><p>{formatDateTime(booking.checkIn)} — {formatDateTime(booking.checkOut)}</p><p>{booking.guestCount} guest(s) · {booking.roomCount || 1} room(s)</p></div>
        </section>
        <aside className="payment-card">
          <h2>Payment summary</h2>
          <div className="payment-row"><span>Total</span><strong>{money(booking.totalPrice)}</strong></div>
          <p>{config.enabled ? 'You will be redirected to Razorpay checkout.' : 'Demo payment mode: no real money is charged.'}</p>
          {error && <div className="form-error">{error}</div>}
          <button className="reserve-button" type="button" onClick={pay}>{config.enabled ? 'Pay with Razorpay' : 'Complete demo payment'}</button>
        </aside>
      </div>
    </main>
  )
}

function BookingPage() {
  const { id } = useParams()
  const [booking, setBooking] = useState(null)
  const [listing, setListing] = useState(null)
  const [payment, setPayment] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/api/bookings/${id}`).then(async (bookingData) => {
      setBooking(bookingData)
      setListing(await api(`/api/listings/${bookingData.listingId}`))
      const payments = await api('/api/payments')
      setPayment(payments.find((item) => item.bookingId === bookingData._id) || null)
    }).catch((err) => setError(err.message))
  }, [id])

  if (error) return <main className="page-state"><div className="empty-state">{error}</div></main>
  if (!booking) return <main className="page-state"><div className="spinner" /></main>
  return (
    <main className="content-page receipt-page">
      <div className="receipt-card">
        <span className="success-mark">✓</span>
        <span className="eyebrow">Booking confirmed</span>
        <h1>{listing?.title}</h1>
        <p>{listing?.address?.street}, {listing?.address?.city}, {listing?.address?.country}</p>
        <div className="receipt-grid">
          <div><span>Check-in</span><strong>{formatDateTime(booking.checkIn)}</strong></div>
          <div><span>Check-out</span><strong>{formatDateTime(booking.checkOut)}</strong></div>
          <div><span>Guests</span><strong>{booking.guestCount}</strong></div>
          <div><span>Rooms</span><strong>{booking.roomCount || 1}</strong></div>
          <div><span>Amount paid</span><strong>{money(payment?.amount ?? booking.totalPrice)}</strong></div>
          {payment?.amount > booking.totalPrice && <div><span>Recalculated stay total</span><strong>{money(booking.totalPrice)}</strong></div>}
          <div><span>Payment status</span><strong>{payment?.status || 'pending'}</strong></div>
          <div><span>Payment reference</span><strong>{payment?.providerPaymentId || 'Processing'}</strong></div>
        </div>
        <Link className="primary-button" to="/trips">View all trips</Link>
      </div>
    </main>
  )
}

function HostPage({ user }) {
  const emptyForm = { title: '', description: '', street: '', city: '', country: 'India', pricePerNight: '', maxGuests: 2, roomCount: 1, availableFrom: '', availableUntil: '', amenities: '', images: '' }
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [hostListings, setHostListings] = useState([])
  const [editingId, setEditingId] = useState(null)

  useEffect(() => {
    if (user?.role === 'host') api('/api/listings/mine').then(setHostListings).catch((err) => setError(err.message))
  }, [user])

  const update = (key, value) => setForm((old) => ({ ...old, [key]: value }))

  function editListing(listing) {
    setEditingId(listing._id)
    setForm({
      title: listing.title || '',
      description: listing.description || '',
      street: listing.address?.street || '',
      city: listing.address?.city || '',
      country: listing.address?.country || '',
      pricePerNight: listing.pricePerNight ?? '',
      maxGuests: listing.maxGuests ?? 1,
      roomCount: listing.roomCount ?? 1,
      availableFrom: toDateTimeInput(listing.availableFrom),
      availableUntil: toDateTimeInput(listing.availableUntil),
      amenities: listing.amenities?.join(', ') || '',
      images: listing.images?.join(', ') || '',
    })
    setError('')
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
    setMessage('')
  }

  async function setListingStatus(id, status) {
    try {
      const updated = await api(`/api/listings/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setHostListings((items) => items.map((item) => item._id === updated._id ? updated : item))
      setMessage(status === 'active' ? 'Your listing is live again.' : 'Your listing has been unlisted.')
    } catch (err) { setError(err.message) }
  }

  async function deleteListing(id) {
    if (!window.confirm('Permanently delete this listing?')) return
    try {
      await api(`/api/listings/${id}`, { method: 'DELETE' })
      setHostListings((items) => items.filter((item) => item._id !== id))
      if (editingId === id) cancelEdit()
      setMessage('Listing permanently deleted.')
    } catch (err) { setError(err.message) }
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (form.availableFrom && form.availableUntil
      && new Date(form.availableUntil) <= new Date(form.availableFrom)) {
      setError('The available-until time must be after the available-from time.')
      return
    }
    const body = {
      title: form.title,
      description: form.description,
      address: { street: form.street, city: form.city, country: form.country },
      pricePerNight: Number(form.pricePerNight),
      maxGuests: Number(form.maxGuests),
      roomCount: Number(form.roomCount),
      availableFrom: form.availableFrom ? new Date(form.availableFrom).toISOString() : null,
      availableUntil: form.availableUntil ? new Date(form.availableUntil).toISOString() : null,
      amenities: form.amenities.split(',').map((value) => value.trim()).filter(Boolean),
      images: form.images.split(',').map((value) => value.trim()).filter(Boolean),
    }
    try {
      if (editingId) {
        await api(`/api/listings/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) })
        setMessage('Listing changes saved.')
      } else {
        await api('/api/listings', { method: 'POST', body: JSON.stringify(body) })
        setMessage('Your listing is live.')
      }
      setHostListings(await api('/api/listings/mine'))
      setEditingId(null)
      setForm(emptyForm)
    } catch (err) { setError(err.message) }
  }

  if (user?.role !== 'host') return <main className="page-state"><div className="empty-state"><HousePlus size={32} /><h3>Host access required</h3><p>Create a host account to list a home.</p><Link className="primary-button" to="/register">Become a host</Link></div></main>

  return (
    <main className="content-page host-page">
      <div className="page-heading"><span className="eyebrow">Host center</span><h1>List your home</h1><p>Give travelers a place to feel at home.</p></div>
      <div className="host-layout">
        <form className="host-form" onSubmit={submit}>
          <div className="form-section">
            <h2>{editingId ? 'Edit listing' : 'Basic details'}</h2>
            <label>Listing title<input required value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="Sunny garden retreat" /></label>
            <label>Description<textarea required rows={5} value={form.description} onChange={(e) => update('description', e.target.value)} /></label>
          </div>
          <div className="form-section">
            <h2>Location</h2>
            <div className="form-grid">
              <label>Street<input required value={form.street} onChange={(e) => update('street', e.target.value)} /></label>
              <label>City<input required value={form.city} onChange={(e) => update('city', e.target.value)} /></label>
              <label>Country<input required value={form.country} onChange={(e) => update('country', e.target.value)} /></label>
            </div>
          </div>
          <div className="form-section">
            <h2>Stay details</h2>
            <div className="form-grid">
              <label>Price per night (₹)<input required min="1" type="number" value={form.pricePerNight} onChange={(e) => update('pricePerNight', e.target.value)} /></label>
              <label>Maximum guests<input required min="1" type="number" value={form.maxGuests} onChange={(e) => update('maxGuests', e.target.value)} /></label>
              <label>Total rooms available<input required min="1" type="number" value={form.roomCount} onChange={(e) => update('roomCount', e.target.value)} /></label>
              <label>Available from (date &amp; time)<input type="datetime-local" value={form.availableFrom} max={form.availableUntil || undefined} onChange={(e) => update('availableFrom', e.target.value)} /></label>
              <label>Available through (date &amp; time)<input type="datetime-local" value={form.availableUntil} min={form.availableFrom || undefined} onChange={(e) => update('availableUntil', e.target.value)} /></label>
            </div>
            <p className="availability-help">Leave either field blank for an open-ended window. Guest check-in and check-out must fall within these exact times.</p>
            <label>Amenities <small>comma separated</small><input value={form.amenities} onChange={(e) => update('amenities', e.target.value)} /></label>
            <label>Image URLs <small>comma separated</small><input value={form.images} onChange={(e) => update('images', e.target.value)} /></label>
          </div>
          {error && <div className="form-error">{error}</div>}
          {message && <div className="form-success">{message}</div>}
          <div className="host-form-actions">
            <button className="primary-button" type="submit">{editingId ? 'Save changes' : 'Publish listing'}</button>
            {editingId && <button className="cancel-edit-button" type="button" onClick={cancelEdit}>Cancel editing</button>}
          </div>
        </form>
        <section className="host-listings">
          <h2>Your listings</h2>
          {hostListings.length ? hostListings.map((listing) => (
            <article className="host-listing-row" key={listing._id}>
              <img src={listing.images?.[0] || images[0]} alt="" />
              <div>
                <h3>{listing.title}</h3>
                <p>{listing.address?.city}, {listing.address?.country}</p>
                <p>{listing.roomCount || 1} total room(s)</p>
                <p>{listing.availableFrom ? formatDateTime(listing.availableFrom) : 'Any date'} – {listing.availableUntil ? formatDateTime(listing.availableUntil) : 'Open ended'}</p>
                <span className={`status status-${listing.status === 'active' ? 'confirmed' : 'cancelled'}`}>{listing.status}</span>
              </div>
              <div className="listing-actions">
                <button type="button" onClick={() => editListing(listing)}>Edit</button>
                {listing.status === 'active' ? <button type="button" onClick={() => setListingStatus(listing._id, 'inactive')}>Unlist</button> : <button type="button" onClick={() => setListingStatus(listing._id, 'active')}>Relist</button>}
                <button className="delete-button" type="button" onClick={() => deleteListing(listing._id)}>Delete</button>
              </div>
            </article>
          )) : <div className="mini-empty">No listings yet.</div>}
        </section>
      </div>
    </main>
  )
}

function DashboardPage({ user }) {
  const [notifications, setNotifications] = useState([]); const [conversations, setConversations] = useState([]); const [error, setError] = useState('')
  useEffect(() => { Promise.all([api('/api/notifications'), api('/api/messaging')]).then(([n,c]) => { setNotifications(n); setConversations(c) }).catch((err) => setError(err.message)) }, [])
  async function markRead(id) { try { const updated = await api(`/api/notifications/${id}/read`, { method: 'PATCH' }); setNotifications((items) => items.map((item) => item._id === updated._id ? updated : item)) } catch (err) { setError(err.message) } }
  return <main className="content-page dashboard-page"><div className="page-heading"><span className="eyebrow">Welcome, {user.name}</span><h1>Your dashboard</h1></div>{error && <div className="form-error">{error}</div>}<div className="dashboard-grid">
    <section><div className="section-heading"><h2>Notifications</h2><Bell /></div>{notifications.length ? notifications.map((n) => <button className={n.readAt ? 'notification read' : 'notification'} type="button" key={n._id} onClick={() => markRead(n._id)}><strong>{n.title}</strong><p>{n.body}</p></button>) : <div className="mini-empty">No notifications yet.</div>}</section>
    <section><div className="section-heading"><h2>Messages</h2><MessageCircle /></div>{conversations.length ? conversations.map((c) => <Link className="conversation" key={c._id} to={`/messages/${c._id}`}><span className="avatar"><UserRound size={18} /></span><div><strong>Conversation</strong><p>{c.messages?.at(-1)?.body || 'Start the conversation'}</p></div></Link>) : <div className="mini-empty">No conversations yet.</div>}</section>
  </div></main>
}

function MessagesPage() {
  const { id } = useParams(); const [conversation, setConversation] = useState(null); const [body, setBody] = useState(''); const [error, setError] = useState('')
  async function load() { try { const items = await api('/api/messaging'); setConversation(items.find((item) => item._id === id) || null) } catch (err) { setError(err.message) } }
  useEffect(() => { load() }, [id])
  async function send(event) { event.preventDefault(); if (!body.trim()) return; try { await api(`/api/messaging/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }); setBody(''); load() } catch (err) { setError(err.message) } }
  return <main className="content-page messages-page"><div className="page-heading"><span className="eyebrow">Inbox</span><h1>Conversation</h1></div>{error && <div className="form-error">{error}</div>} {conversation ? <><div className="message-list">{conversation.messages?.length ? conversation.messages.map((m, i) => <div className="message" key={i}><p>{m.body}</p><small>{new Date(m.sentAt).toLocaleString()}</small></div>) : <div className="mini-empty">No messages yet.</div>}</div><form className="message-form" onSubmit={send}><input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message..." /><button type="submit">Send</button></form></> : <div className="empty-state">Conversation not found.</div>}</main>
}

function ProtectedRoute({ user, children }) { return user ? children : <Navigate to="/login" replace /> }

function AppShell() {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('airbnb_user')) } catch { return null } })
  function logout() { localStorage.removeItem('airbnb_token'); localStorage.removeItem('airbnb_user'); setUser(null) }
  return (
    <BrowserRouter>
      <Header user={user} onLogout={logout} />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<AuthPage mode="login" setUser={setUser} />} />
        <Route path="/register" element={<AuthPage mode="register" setUser={setUser} />} />
        <Route path="/listing/:id" element={<ListingPage user={user} />} />
        <Route path="/trips" element={<ProtectedRoute user={user}><TripsPage user={user} /></ProtectedRoute>} />
        <Route path="/host" element={<ProtectedRoute user={user}><HostPage user={user} /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute user={user}><DashboardPage user={user} /></ProtectedRoute>} />
        <Route path="/messages/:id" element={<ProtectedRoute user={user}><MessagesPage /></ProtectedRoute>} />
        <Route path="/checkout/:id" element={<ProtectedRoute user={user}><CheckoutPage user={user} /></ProtectedRoute>} />
        <Route path="/booking/:id" element={<ProtectedRoute user={user}><BookingPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <footer className="footer"><Link className="brand" to="/"><span className="brand-mark"><Home size={18} fill="currentColor" /></span><span>Staybnb</span></Link><p>© 2026 Staybnb. Find a place worth remembering.</p></footer>
    </BrowserRouter>
  )
}

export default AppShell
