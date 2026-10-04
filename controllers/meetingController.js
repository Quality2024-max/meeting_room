import crypto from 'node:crypto';
import Meeting from "../models/meetingModel.js";
import Recording from "../models/recordingModel.js";




const newCode = () => crypto.randomBytes(4).toString('hex'); // 8 chars

export const getDashboard = async (req, res) => {
    const meetings = await Meeting.findByHost(req.user.id);
    const recs = await Recording.findByHost(req.user.id);

    // group recordings by meeting id
    const recordings = {};
     recs.forEach((r) => { (recordings[r.meeting_id] = recordings[r.meeting_id] || []).push(r); });

     
  res.render('meeting/dashboard', { meetings, recordings, joinError: req.query.error || null });
}

export const newForm = (req, res) => {
  res.render('meeting/new-meeting', {error: null});
}

export const create = async (req, res) => {
  const {title, type, candidate_name, scheduled_at, duration_min} = req.body;
  console.log(req.body);
  if(!title || !scheduled_at){
    return res.render('meeting/new-meeting', {error: 'Add a title and a start time'})
  }
  await Meeting.create({
    roomCode: newCode(),
    title: title.trim(),
    type: type === 'interview' ? 'interview' : 'meeting',
    hostId: req.user.id,
    candidateName: candidate_name || null,
    scheduledAt: scheduled_at,
    durationMin: parseInt(duration_min, 10) || 30
  });
  console.log(Meeting);
  res.redirect('/dashboard');
}


export const remove = async (req, res) => {

await Meeting.remove(req.params.id, req.user.id);
res.redirect('/dashboard');
}

