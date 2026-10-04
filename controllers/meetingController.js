import Meeting from "../models/meetingModel.js";
import Recording from "../models/recordingModel.js"





export const getDashboard = async (req, res) => {
    const meetings = await Meeting.findByHost(req.user.id);
    const recs = await Recording.findByHost(req.user.id);

    // group recordings by meeting id
    const recordings = {};
     recs.forEach((r) => { (recordings[r.meeting_id] = recordings[r.meeting_id] || []).push(r); });

     
  res.render('meeting/dashboard', { meetings, recordings, joinError: req.query.error || null });
}



