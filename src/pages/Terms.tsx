import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { COMPANY_ADDRESS, COMPANY_NAME, COMPANY_REG_NO, CONTACT_EMAIL } from '../lib/contact';

/** Draft terms of service. Have them reviewed by a lawyer before public launch. */
export default function Terms() {
  const { session } = useApp();
  return (
    <div className="stack-lg">
      <AppHeader title="Terms of service" eyebrow="Last updated 7 November 2026" back={!!session} />
      <section className="card stack">
        <h2 className="title">Using Ritmo</h2>
        <p>Ritmo Running ("Ritmo") is provided by {COMPANY_NAME} (registration number {COMPANY_REG_NO}), {COMPANY_ADDRESS} ("we", "us"). It is a training app that analyses your running data and suggests training. By creating an account you agree to these terms and to our <Link to="/privacy">privacy policy</Link>. You must be at least 18 years old to use Ritmo. You confirm this when you create an account, and Ritmo asks for your date of birth during setup.</p>
        <h2 className="title">Coaching, not medical advice</h2>
        <p>Ritmo gives general coaching guidance based on your data. It is not medical advice and does not replace a doctor, physio or qualified coach. Check with a doctor before starting a training programme if you have a medical condition, and stop exercising and seek medical help if you have chest pain, dizziness, fainting or unusual breathlessness. You train at your own risk. If the health check in setup suggests checking with a doctor, please do so before you start.</p>
        <h2 className="title">Your account and data</h2>
        <p>You are responsible for keeping your password safe. Your training data belongs to you. You give Ritmo permission to store and process it only to provide the service to you, as described in the privacy policy. You can export or delete your data and account at any time from Privacy and your data. Ritmo never sells your data and never uses it to train AI models.</p>
        <h2 className="title">Profile pictures</h2>
        <p>Only upload a photo of yourself, or one you have the right to use. Do not upload photos that are offensive, show other people without their permission, or break the law. Your photo is private to you.</p>
        <h2 className="title">AI coach</h2>
        <p>The AI coach is optional and can be turned off at any time. Its answers are generated from your training data and may occasionally be wrong; use your judgement and the guidance above. Use of the AI coach is limited to a fair number of answers an hour and a day.</p>
        <h2 className="title">Connected services</h2>
        <p>When you connect a service such as Garmin Connect, Apple Health or Health Connect, Ritmo reads the data you allow and you can disconnect at any time. Those services have their own terms. Ritmo is not affiliated with or endorsed by Garmin, Apple or Google.</p>
        <h2 className="title">Acceptable use</h2>
        <p>Do not misuse Ritmo, try to access other people's data, upload files you do not have the right to share, or interfere with the service.</p>
        <h2 className="title">Changes and availability</h2>
        <p>Ritmo is in active development. Features may change, and we may update these terms; we will tell you about significant changes in the app. We aim to keep Ritmo available but cannot guarantee uninterrupted service. To the extent the law allows, Ritmo is provided "as is" and our liability is limited to the amount you have paid us in the previous 12 months.</p>
        <h2 className="title">Contact</h2>
        <p>{COMPANY_NAME}, {COMPANY_ADDRESS}. Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </section>
      <p className="caption"><Link to="/about">About Ritmo</Link> · <Link to="/privacy">Privacy</Link></p>
    </div>
  );
}
