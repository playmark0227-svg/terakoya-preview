/* ============================================================
   ルール本体（レベル・講座の開放・スタートガイド・タイムライン・案件・イベント・紹介報酬・ランキング・支払い）
   ------------------------------------------------------------
   判定はすべてここに集める。画面（会員ページ・運営画面）にはルールを書かない。
   状態は保存せず、その場で計算する（講座が開いているか、報酬がいくらか、など）。
   そうしておけば「保存し忘れて、開くはずのものが開かない」事故が起きない。
   書き換えは CLG.store.update() を通す（保存と、別のタブへの知らせが1か所で済む）。

   書き換える関数は結果を返す。XPが付くものは CLG.app.reward(result) に渡すと、
   XPの加算・レベルアップ・講座の開放・スタートガイドの達成を同じ見せ方で知らせてくれる。
   result の形：{ xp, why, levelUp:{from,to,name,unlocked[],gigs[]}|null, courseCompleted?, steps?[], pt?（自分に付いたpt）, ptWhy? , …関数ごとの値 }
     levelUp.gigs はレベルが上がって応募できるようになった案件（講座の修了の条件も満たすものだけ）

   入力を確かめる関数は { ok:true, … } か { ok:false, errors:{欄の名前: 文} } を返す（U.fieldErrors にそのまま渡せる）。
   1つの文だけのときは { ok:false, error:'…' }。

   ■ 関数の一覧（R = CLG.rules）。★ は 2026-09-25 に足したもの・形を広げたもの。☆ は 2回目（運営画面と会員ページをつなぐもの・CMS）。
     ◆ は 3回目（固定・運営の投稿の直し・報酬の取消・振込先のない支払い・支払いエラー中の解約・修了証・学部の CMS など）
   ―― 会員・共通
     me()                               state.me
     day()                              入会から何日目か（入会日＝1日目）
     person(id)                         ★{ id, name, area（公開範囲で切った地域）, color, lv, photo, staff?, role?, bio?, no?, me? }
                                        id は 'me' / PEOPLE のid / 会員番号（ROSTER）。在籍半年の会員の 'm8' は自分として返す
     cohort(at?)                        ★「2026年9月入会」（at を渡せばその日の分）
     streak()                           { weeks, thisWeek } 週単位の継続
     missingFields()                    ★{ list:[{key,label}], keys[], text:'未入力：地域・いまのお仕事'|'' }（ホームとスタートガイドで共通）
     profile()                          ★{ nickname, visibility（city/pref/none）, photo }
     validateProfile(patch)             ★{ ok, errors }（name / nickname / visibility / photo / goal / area / job）
     saveProfile(patch)                 ★name・kana・area・job・goal などは me に、nickname・visibility・photo は profile に。
                                        email は直接は変えず requestEmailChange に回す。戻り値はスタートガイドの result か null
   ―― 学び
     xp() / level(xp?) / levelName(lv) / coursesAtLevel(lv) / course(id) / courseState(c) / lessonState(c, lessonId)
     completeLesson(courseId, lessonId) result（★講座を修了したら certificate:{no,at} も入る）
     continueList() / seeArchive(id)
     lessonPos(lessonId)                ★前回の位置（秒）。lessonPos(lessonId, 秒) で保存（画面は描き直さない）
     resumeText(lessonId)               ★「前回の続き 4:12 から」か ''
     lessonNote(lessonId[, text])       ★講座のメモ（会員ごと。デモを戻すと消える）。text を渡すと保存。note(…) は同じもの
     quiz(courseId)                     ★{ course, questions:[{i,q,choices[]}], total, pass, ready（全回見た）, locked, result|null } か null
     submitQuiz(courseId, answers[])    ★result ＋ { score, total, passed, firstPass, results:[{i,chosen,answer,correct,why,lesson:{id,title,href}|null}] }
                                        はじめて合格したときだけ XP.quiz。修了の条件にはしない（決定事項）
     certificate(courseId)              ★{ no, date, course:{id,title}, name, memberNo, teacher } か null（修了していない）
                                        ◆一度出した修了証（state.certificates）は、あとで運営が回を足して全回に届かなくなっても返す
     completedCount(personId?)          ★修了した講座の数（自分は実際の数、ほかの人は XP からの見込み）。◆修了証のある講座も数える
                                        （案件の「講座の修了で応募できる」・スタートガイドの講座の項目も同じ。修了は消えない）
   ―― スタートガイド
     steps()                            ★成果発表会の項目は title「次の成果発表会（M/D）」・outside:true・event・eventAt・baseTitle が付く
     onboarding()                       ★{ steps, weeks:[{n,steps}]（成果発表会を除く）, showcase, done, total, pct, day, current, finished, missing }
     syncSteps() / completeStep(id) / setGoal(what, by)
     lineLink()                         ★{ status: none/pending/linked/failed, label, at, code? }
     startLineLink()                    ★連携を始める（pending・連携コード）→ lineLink()
     finishLineLink(ok)                 ★ok なら linked（スタートガイドの result）、false なら failed（{status:'failed'}）
     unlinkLine()                       ★連携を外す
     linkLine(on)                       今までどおり（true ならすぐ連携済み、false なら外す）
     validateRefCode(code)              ★{ ok, empty?, code, message }「有効な紹介コードです」／「見つかりません（空欄でも申込めます）」
   ―― タイムライン
     feed(kind)                         投稿の配列（今までどおり。'post' は自己紹介も含む）
     feed({ kind, page, pageSize })     ★{ items（そのページ）, shown（1ページ目から）, total, page, pages, pageSize, hasMore }
                                        kind: all / post / question / win / intro / news / new / gig / event / staff（運営の4種）/ mine
                                        投稿の形：FEED の形 ＋ { mine, liked, likeCount, comments（見えるコメントの数）, edited?, images?[{src,alt}], staffPost? }
                                        運営が運営画面から出した投稿（state.staffPosts）も混ぜる。運営が隠した投稿（state.hiddenPosts）は出さない
                                        ◆固定（pinned）した投稿が先頭（固定どうしは新しい順）。pinned は運営の固定・外した印（state.pins）が優先
     post(id)                           ★1件（削除済み・見つからなければ null。ミュート中の人なら muted:true。自分の投稿が隠されていれば hidden:{at,reason}）
     addPost(text, kind, images?)       ★kind: post / question / win / intro。images は最大4枚（data URL か assets/img/…）
     imageLimit / validateImages(list)  ★{ max:4, bytes }／{ ok, error, images }
     editPost(id, text) / deletePost(id)★自分の投稿だけ。true/false
     reportPost(postId, reason, commentId?)  ★{ ok, report } REPORT_REASONS から選ぶ（自分の投稿でも、ほかの人のコメントは通報できる。
                                        断るのは自分の投稿そのものと自分のコメントだけ）。☆同じものを受付中にもう一度通報すると { ok, report, existing:true }
     mutePerson(personId) / unmutePerson(personId) / mutes()  ★
     toggleLike(postId) / introText()
     comments(postId)                   ★上の段の配列。各 { id, postId, by, who, at, text, answer, thanks, thanked, mine, canThank, replyTo, replies[], hidden? }
                                        ☆運営が隠したコメント（hideComment・通報の非表示）は、書いた本人にだけ hidden:{at,reason} つきで出る
                                        返信は1段だけ（返信への返信は、その親への返信にそろえる）
     commentCount(postId)               ★見えるコメントの数
     addComment(postId, text, replyToId?) ★{ ok, id, parent, pt?（新入生への声かけ +5pt） } か { ok:false, error }
     deleteComment(commentId)           ★自分のコメントだけ
     thankComment(commentId)            ★「ありがとう」。1つのコメントに1回、自分のコメントには押せない。
                                        書いた人に +2pt（ランキングに入る）。{ ok, to, toPt（相手に入った pt） } か null
   ―― 会員名簿
     members({ pref, cohort, faculty, lv, q, sort })  ★名簿の行 [{ id, no, name, me, color, photo, lv, area, pref, cohort, cohortKey, joinedAt, job, faculty, href }]
                                        地域は本人の公開範囲で切る。都道府県を出していない人は pref の絞り込みに出ない
     membersFacets()                    ★{ prefs[{value,count}], cohorts[{value,label,count}], faculties[{value,label,count}], lvs[{value,label,count}] }
     memberProfile(id)                  ★{ id, no, name, me, staff, role, color, photo, cohort, joinedAt, lv, lvName, area, job, goal, bio,
                                           intro, posts[], hostedEvents[], gigs[], completed, href } か null（退会・見つからない）
   ―― 検索
     search(q)                          ★{ q, total, groups:[{ key, label, total, items:[{ type, id, title, titleMark, sub, href, snippet, mark, locked?, at? }] }] }
                                        群：courses 講座 / lessons 講座の回 / archive 勉強会の録画 / gigs 案件 / events イベント / posts 投稿 / help ヘルプ
                                        mark・titleMark は [始まり, 終わり]（文字の位置。強調は画面で esc したうえで付ける）
   ―― 案件
     gig(id)                            GIGS・GIGS_CLOSED・自分の募集から探す
     gigLock(g) / withdrawGig(id)
     gigEarnings()                      ★報酬が決まった案件（完了・報酬確定）の合計。稼働中の案件の報酬は入れない
     GIG_LABELS                         ★{ applied:'応募済み', meeting:'面談の調整中', active:'稼働中', done:'完了', referred:'紹介済み', declined:'見送り'☆ }
     gigState(id)                       ★{ key, label, tag（U.statusTag のキー）, sub, status, at, … } か null
                                        state.gigs の status：applied / meeting / active / done / rewarded（運営が報酬を確定した。key は 'done'）/ declined☆（見送り。sub「今回は見送りになりました」）
     gigDisclosure(id)                  ★応募の窓に出す、相手に伝わることの1文
     applyGig(id, note)                 ★result ＋ { disclosure }（応募できないときは null）
     gigHistory(id)                     ★[{ at|null, text, done }] 日付の順。これからの予定（報酬確定・支払予定日など）は done:false
                                        記録がない古い案件も、応募・完了の行を gigs[id].at / doneAt から足す。
                                        会員どうしの募集の次の行は「掲載した会員から返事」。今月の作業報告を出したら「◯月分の作業報告」の予定は出さない
     gigReward(id)                      ★{ amount, status:'confirmed'|'paid', label, payAt, needBank, paidAt?, carried?, note? } か null（報酬の額が決まった案件だけ）
                                        ◆支払日（当月末・翌月末）は土日なら翌営業日。振込先がないまま支払日を過ぎても支払済にしない
                                        （確定のまま、次の月末へ繰り越す：carried:true・note「振込先が未登録のため、次の支払日に繰り越し」）
     checkBanned(text)                  ★当たった禁止の種類の配列（投資・ローン・ノウハウの販売・収入の保証・勧誘）
     validateGig(form)                  ★{ ok, errors } createGig と同じ確かめ（締切の範囲も）。何も作らない
     createGig(form)                    ★会員どうしの募集を出す → status 'review'。{ ok, gig } / { ok:false, errors }
                                        form: { title, desc, reward, payment, remote, place, time, slots, level, closesAt, agree, from? }
                                        from に差し戻された自分の募集の id を渡すと、同じ id のまま直して確認に出し直す（resubmitted:true）
     editGig(id, form)                  ☆自分の募集を直す。差し戻し → createGig の from と同じ（同じ id で確認に出し直す・{ ok, gig, resubmitted:true }）。
                                        確認中 → その場で直す（{ ok, gig, edited:true }）。掲載中・終了は { ok:false, error }。入力の誤りは { ok:false, errors }
     myGigs()                           ★自分の募集 [{ …gig, statusLabel, tag, applicantCount, rejectReason }]
     closeGig(id)                       ★掲載を終える
     applicants(id)                     ★[{ person, who, at, note, status（applied/accepted/declined）, label, tag }]
     acceptApplicant(gigId, personId) / declineApplicant(gigId, personId)  ★採用すると3者のスレッドができる
     submitWorkReport(id, { url, memo, fileName })  ★稼働中の案件だけ。{ ok, report } / { ok:false, errors }
     workReports(id)                    ★作業報告の一覧
     gigThread(id)                      ★{ participants[], messages[{from,who,mine,at,text}], canSend } か null（掲載者・応募者・運営だけ）
     sendGigMessage(id, text)           ★{ ok, message } / { ok:false, error }
   ―― 振込先（案件の報酬と紹介報酬で共通）
     validateBank(form)                 ★{ ok, errors, value } form: { bank, branch, kind（普通/当座）, number（7桁）, holder（カタカナ）, invoiceNo? }
     setBank(form)                      ★{ ok, bank } / { ok:false, errors }（口座番号は下4桁だけ残す）
     bank()                             ★null か { bank, branch, kind, tail, holder, invoiceNo, number:'***4567', masked:'〇〇銀行 〇〇支店 普通 ***4567 ヤマダ ハナコ', at }
     removeBank()                       ★
   ―― イベント
     event(id) / isReserved(id) / isFull(e) / attended(id) / myUpcoming() / attend(id)
                                        ★event(id) は、運営が載せた自分の企画（memberEvents）も探す
     upcoming()                         これからの会（★「30日以内の方向け」は、入会30日を過ぎた人と、オリエンテーションに一度出た人には出さない。
                                        予約していれば出す。todayEvents・search も同じ。自分の企画で載ったものも入る）
     memberEvents()                     ★運営が載せた自分の企画 [{ id（企画のid）, own:true, kind, title, at, min:0, place, cap, count:0, fee, host:'me', desc }]
     eventOpen(e)                       ★その人が予約できる会か（対象・満席でないか）
     reserve(id) / unreserve(id)        予約するとキャンセル待ちからは外れる。◆オリエンテーション（audience 'new30'）に出た人は、次の回を予約できない（eventOpen も false）
     pastReserved()                     ◆予約していて終わった会のうち、出欠がまだ付いていないもの（「参加した」に入る前。運営が出欠を付けると消える）。新しい順
     joinWaitlist(id) / leaveWaitlist(id)  ★{ ok, position } / true
     waitlistPos(id)                    ★キャンセル待ちの何番目か（0＝入っていない）
     eventAccess(id)                    ★{ reserved, online, opensAt, ready, zoomUrl（開始30分前から終わりまで）, live, ended, venue（予約した人だけ）, venues[] }
     todayEvents()                      ★今日のまだ終わっていない会 [{ …event, reserved, access }]
     attendees(id)                      ★{ count, list[person] }（予約した人。自分が予約していれば先頭）
     proposeEvent(form)                 ★会員の企画 → 運営の確認へ。form: { title, at, online, place, cap, fee, desc }
     applySpeaker(id, title)            ★成果発表会の発表に申し込む（題に金額は書けない）。予約もする
     speakerApp(id) / proposals()       ★自分の申込み（status review/approved/rejected, statusLabel）。◆発表の申込みが決まったら statusLabel は「決定」（企画は「掲載中」）
   ―― メッセージ・専門家
     thread()                           運営とのやりとり（★5分より先の時刻のもの＝翌朝のあいさつなどは、その時刻まで出さない。notices() も同じ）
     unread() / markRead()
     sendMessage(text, kind, attachments?, ref?)  ★Promise → { xp:0, reply（すぐの自動返信）, next（5秒ほどあとの返事の Promise。運営画面が開いていれば null） }
                                        attachments: [{ name, type（image/pdf/file）, size, url? }] 最大4つ。ref: 'lesson:<講座>/<回>' / 'archive:<録画>' / 'gig:<案件>'
     meetingSlots()                     ★面談の候補 [{ id, at, label:'9/26(土) 21:00' }]。面談の枠は ☆R.setMeetingSlots の設定（state.settings.meetSlots）→
                                        運営画面の保存（terakoya-admin-v1 の meetSlots）の順に見る。枠があれば、休みの日と予約済みの時刻を除いた次の3つ（別の日）。
                                        日時を決めた枠（fixed）なら、これからの空いている3つ。どちらもなければ平日の夜2つと土曜の午前
     setMeetingSlots(slots)             ☆運営画面から：面談の枠を決める。slots は { weekly:[{dow（0＝日）, time:'21:00'}], off?:[{at, why}], min? } か
                                        毎週の枠の配列、日時の配列（['2026-09-30T12:00:00Z'] か [{at}]）。null で消す。人を切り替えても残る
                                        → { ok, config, slots（meetingSlots() の結果） } / { ok:false, error }
     meetingSlotConfig()                ☆いまの枠の設定（上の形）か null
     bookMeeting(slot)                  ★{ card, confirmed（Promise：運営が確定したらスタートガイドの result。運営画面が開いていれば運営が確定する） }
                                        確定したときだけ「面談」の項目が済になる
     adminOpen()                        ★運営画面が開いているか（localStorage 'terakoya-admin-open' の時刻が40秒以内）。
                                        開いていれば、試作版の「運営の返事・面談の確定・専門家の日程調整」を自動ではしない（運営が本当にするため）
     meeting(id?) / meetings()          ★予約の札 { id, at, status（pending/confirmed/canceled）, label, zoomUrl }
     cancelMeeting(id)                  ★
     confirmMeeting(id)                 ★運営が確定する（試作版は bookMeeting が数秒後に呼ぶ）→ result
     EXPERT_STEPS                       ★['受付','日程調整','予約確定','相談済み']
     requestExpert(id, form)            ★{ ok, request } / { ok:false, errors }  form: { text, when }
     expertRequests()                   ★[{ id, expert, ex, who, at, status, stepIndex, tag, text, when, history[] }]
     advanceExpert(reqId, status?)      ★運営が次の段に進める
   ―― お知らせ・通知
     notices(opt?)                      ★[{ id, type, icon, at, text, link, go, unread }] 新しい順。opt: { unreadOnly, limit }
                                        ☆運営が CMS で直したお知らせ（data.js の分の文・リンク・非表示）と、足したお知らせ（target が合うもの）も入る
     unreadNotices() / markNoticeRead(id)★ / markAllNoticesRead()★ / markNoticesRead()（＝すべて既読。古い名前）
     notifyPrefs()                      ★[{ id, name, line, email, fixed, lineReady }]
     setNotifyPref(type, channel, on)   ★channel: 'line' / 'email'。止められない種類は false を返す
   ―― アカウント・安全
     PASSWORD_RULE                      ★「8文字以上。英字と数字を両方入れる」
     validateLoginId(id)                ★{ ok, kind:'no'|'email', value } / { ok:false, error }
     checkLogin(id, pw)                 ★{ ok } / { ok:false, field:'id'|'pw'|'both', error:'会員番号かパスワードが違います' }
     changePassword(cur, next, again)   ★{ ok, at, loggedOut } / { ok:false, errors:{cur,next,again} }（変えると、ほかの端末はログアウト）
     requestPasswordReset(idOrEmail)    ★{ ok, to, link:'#/reset?token=demo', expiresAt }（登録があるかどうかは答えない）
     checkResetToken(token)             ★{ ok, kind } / { ok:false, expired?, error }（試作版：'demo…' が有効・'expired' は期限切れ）
     resetPassword(token, next, again)  ★{ ok } / { ok:false, errors } / { ok:false, error, expired }
     setPassword(next, again, token?)   ★入会完了のメールから、はじめてパスワードを決める
     needsPassword()                    ★まだパスワードを決めていないか
     requestEmailChange(addr)           ★{ ok, pending } / { ok:false, error }（確認されるまで今のアドレスのまま）
     pendingEmail()                     ★null か { addr, at, sentAt, expiresAt, expired }
     confirmEmailChange(token?) / cancelEmailChange() / resendEmailChange()  ★（送り直しは1分あける）
     sessions() / logoutOthers() / logoutSession(id)  ★ログイン中の端末
     requestData(kind)                  ★kind 'export'（記録の書き出し）/ 'delete'（削除の申込み）→ { ok, request:{ id, kind, at, status:'received' } }
                                        同じ種類で受付中のものがあれば、それを返す（ok:true, existing:true）
     dataRequests() / cancelDataRequest(id)  ★新しい順 [{ id, kind, label, at, status（received/canceled/done）, canceledAt?, doneAt? }] / true|false
     completeDataRequest(id)            ☆運営画面から：受付中の申込みを済みにする（会員にお知らせ）→ { ok, request } / { ok:false, error }
     loginBlocked(no?)                  ☆ログインを止めているか → null か { at, reason }。state.loginBlock（R.setLoginBlocked）と、運営画面の保存の
                                        members[会員番号].suspended のうち、新しく書かれたほうに従う。no（ほかの会員番号）を渡すと運営画面の保存だけを見る
     setLoginBlocked(on, reason?)       ☆運営画面から：この会員のログインを止める（true）・再開する（false）→ { ok, blocked }。開いている会員ページのタブもすぐ変わる
     adminSuspension()                  ★loginBlocked() と同じ（前からの名前。会員ページは入口で止める）
   ―― 支払い
     PLAN_LABELS                        ★{ active:'有効', canceling:'解約予定', ended:'終了', past_due:'支払いエラー', paused:'休会中' }
     plan()                             ★{ status, label, price, card, nextBill, periodEnd, lastDay（使える最後の日）, cancelAt, lastBill,
                                           graceUntil, failedAt, endedAt, keepUntil, pausedUntil, canUse, limited, rejoin, banner,
                                           cancelEnd（いま解約したら終わる時刻）, cancelReasons[], canceledAt }
     planBanner()                       ★全画面に出す帯 { kind, text, href, action } か null
     planGate(routeName)                ★{ ok, reason:'ended'|'limited'|null, plan }（終了・支払いエラーの猶予切れ・休会中は見られる画面をしぼる）
                                        終了：account・help・notices・card（会員証は「会員期間終了」の面を出す）
     invoices(opt?)                     opt.upcoming で次回の予定の行（status 'upcoming'）を先頭に。
                                        行の status：paid / failed / refunded（refund:{ at, amount, reason }）/ upcoming
     cancelPlan(opt?) / resumePlan()    解約は2回押すだけ（引き止めは画面で1回まで）。期間の最後まで使える。
                                        ◆支払いエラーのまま解約した人（解約予定＋failedAt）が取り消すと、払えていない請求が残っていれば支払いエラー（同じ猶予）に戻る
                                        ★opt.reasons（解約の理由の配列）を plan.cancelReasons に残す（運営画面の集計）。
                                        支払いエラー中は次の請求日の前日まで。休会中の解約は、その日で終わる（使っていない期間の会費は取らない）
     pausePlan(months)                  ★SITE.allowPause が true のときだけ動く（既定は false）
     resumePause()                      ★休会をやめる。休会中なら allowPause にかかわらず戻せる（試作版バー・運営画面で休会にしたときも）
     refundInvoice(id, amount?, reason) ★運営画面から：支払済の請求を返金にする（amount 省略で全額）。お知らせも出す → { ok, invoice } / { ok:false, error }
     updateCard(card?)                  ★Stripe から戻ったことにする。支払いエラーなら払い直して有効に戻す → { ok, card, recovered, plan }
                                        ◆解約予定＋failedAt も払い直す（解約はそのまま。failedAt・graceUntil を消す）
     planBanner()                       ◆解約予定＋failedAt も、支払いエラーと同じ帯（猶予のあいだ／猶予切れ。「カードを更新する」→ #/account?focus=card）
     setPlanDemo(status, opt?)          ★試作版バーの「契約の状態」。active/canceling/ended/past_due/paused（opt.expired で猶予切れ）
     rejoinLink()                       ★{ href:'index.html#/join?rejoin=1', label, keepUntil }
     unusedSummary()                    ★{ courses, minutes, events（★いま解約したら終わる時刻＝plan().cancelEnd まで）, eventsUntil, eventList[], referralMonthly, perks }
   ―― 紹介・ポイント・ランキング
     referral() / rewardRows()          ★明細の行に id（'r1-1' など）が付いた。運営が付けた確定・支払予定・支払いも反映する
                                        （rewardStatus[行id].status が 'scheduled' なら、確定の行を支払予定にし、payAt があればその日を支払日にする）
                                        ◆振込先がないまま支払日を過ぎた行は支払済にしない：支払予定のまま次の支払日へ（carried:true・note）。
                                        振込先をあとで登録したら、登録したあとの最初の支払日に支払済。運営の取消（voidReward）は status 'void'・voidReason。
                                        行の形 { id, ref, who, at, amount, status, label, confirmAt, payAt, paidAt, confirmedBy, scheduledBy, carried?, note?, voidAt?, voidReason? }
     removeBank()                       ◆振込先を消しても、それまでに払った報酬は支払済のまま（記録に残してから消す）
     points()                           ★{ total（1年以内）, month（今月＝暦の月）, recent（= month）, lastMonth, monthNo, log[{id,at,pt,rule,why,link}] }
     ranking(kind, opt?)                ★暦の月で数える。kind 'points'/'xp'。opt.month = -1 で先月。
                                        行 { rank, person, id, no, name, area, color, lv, photo, value, me, href, prize?, prizeStatus? }
                                        上位は RANKING、その下は ROSTER。自分が押した「ありがとう」・運営が選んだ回答・運営が付けたptを足す
     rankTotal(kind?, opt?)             ★今月ポイントがある人数（「241人中8位」の母数）
   ―― 運営画面から書くもの（会員のタブは storage のイベントで描き直る）
     staffReply(text, from?)            ★運営の返信をスレッドに足す（お知らせも出す）
     reviewGig(id, 'approve'|'reject', reason)  ★会員の募集の確認
     markAnswer(commentId)              ★質問への回答に選ぶ（書いた人に +10pt「質問に答えた」）
     simulateThanks(commentId, personId)★試作版：自分のコメントにほかの会員から「ありがとう」が届いたことにする（+2pt）
     grantPoints(personId, ruleId, why, link?) / revokePoints(entryId, why?)  ★
     confirmReward(rowId) / payReward(rowId)   ★紹介報酬の確定の記録と支払い（振込先がないと払えない。支払予定の行は確定できない）
     scheduleReward(rowId, { payAt? })  ★月末の締め：確定の行を支払予定にする（保留・取消・支払済は不可）。お知らせは出さない（運営画面が publishNotice で出す）
     markAttendance(eventId, personId?) ★出欠を付ける（この会員なら XP。ほかの会員は { other:true } を返すだけ）
     publishNotice({ target, text, link })  ★target: all / new30 / cohort:2026-09 / lv:3 / lv>=3 / member:TS-000271 → { ok, delivered }
     approveEventProposal(id, approve?, reason?)  ★
     setMemberStatus(status)            ★契約の状態を変える（= setPlanDemo）
     advanceGigApp(gigId, status, { reward?, reason? })  ★応募を進める：applied → meeting → active → done → rewarded。
     advanceGigApp(gigId, personOrMe, status, opt?)    ☆同じ。personOrMe が会員ページの会員（'me'・自分の会員番号・m8）でなければ何もせず
                                        { ok:true, other:true }（ほかの会員は運営画面の記録だけ）。status 'declined' で見送り（declineGigApp）。
                                        履歴・お知らせを足し、done で XP.gigDone（result）。rewarded は reward（円）で報酬を決める
     declineGigApp(gigId, reason?)      ☆応募中・面談の調整中の応募を見送りにする（会員にお知らせ）→ { ok, status:'declined' } / { ok:false, error }
     simulateApplicant(gigId, personId, note?)  ★試作版：自分が出した募集（掲載中）に、ほかの会員からの応募が来たことにする
     promoteWaitlist(eventId, who?)     ★キャンセル待ちから予約に繰り上げる（満席でも。運営が定員を増やしたとき）→ { ok, reserved } とお知らせ。
                                        ☆who が会員ページの会員でなければ何もせず { ok:true, other:true }
     addStaffPost({ id?, kind, by, text, link?, pinned?, at? })  ★運営の投稿をタイムラインに出す（kind: news/new/gig/event。at が先なら予約：その時刻まで出ない）→ { ok, post }
     updateStaffPost(id, { text?, link?, kind?, at?, pinned? })  ◆運営の投稿を直す（公開の前・後。書いた欄だけ）→ { ok, post } / { ok:false, errors|error }
     removeStaffPost(id)                ◆運営の投稿を取り下げる（予約のまま・公開のあと、どちらも記録ごと消す）→ { ok } / { ok:false, error }
     pinPost(postId) / unpinPost(postId)◆投稿を固定する・外す（data.js の投稿も・運営の投稿も。タイムラインの先頭に並ぶ）→ { ok, pinned } / { ok:false, error }
     pinnedPosts()                      ◆固定している投稿の id の配列（予約の運営投稿・隠した投稿も入る。運営画面の一覧で使う）
     resetStaffFeed()                   ◆運営の投稿・固定・隠した投稿とコメントを全部消す（運営のデモを最初に戻すとき）→ { ok }
     hidePost(postId, reason) / unhidePost(postId)  ★投稿を隠す・戻す（タイムライン・検索・会員のページから消える。書いた本人には理由つきで見える）
                                        ◆会員ページの会員の投稿なら、本人にお知らせ「運営があなたの投稿を非表示にしました（理由）」→ #/feed/<投稿>。{ ok, notified }
     hideComment(commentId, reason) / unhideComment(commentId)  ☆コメントを隠す・戻す → { ok } / { ok:false, error }
                                        ◆会員ページの会員のコメントなら、本人にお知らせ → #/feed/<投稿>?c=<コメント>。{ ok, notified }
     resolveReport(reportId, action, reason?)  ★通報の対応。action は 受付/非表示/注意/対応不要 か ☆hide/warn/dismiss/open（REPORT_ACTIONS）。
                                        ☆非表示にすると通報された投稿（コメントの通報ならそのコメント）を隠し、受付に戻すとこの通報で隠したものを戻す。
                                        対応が決まったら、通報した会員にお知らせ（書いた人の名前は出さない）→ { ok, report }
     closeMonth(ym?, { payAt?, notice? })  ☆月末の締め：ym（'2026-09'。省略で今月）の末までに確定した明細（確定のもの）を、まとめて支払予定にする。
                                        支払日は payAt か翌月の支払日（土日は翌営業日）。notice:true で会員にお知らせ（運営画面が publishNotice で出すなら付けない）
                                        → { ok, ym, payAt, count, amount, rows[明細id] } / { ok:false, error }。紹介の画面の明細も「支払予定」になる
     payMonth(ym?, { notice? })         ☆支払い：その月に締めた（支払予定の）明細を支払済にする → { ok, ym, count, amount, rows } /
                                        { ok:false, error, carried?[明細id], ym? }（振込先がない・最低額に届かないときは払わず繰り越し）
                                        ◆最低額に届かないときは、明細を翌月の締めに回す（支払日を翌月に・note「◯円未満のため、翌月に繰り越し」・ym に翌月）。
                                        振込先がないときは記録を書かない（rewardRows が支払日を過ぎても支払予定のまま繰り越す）
     voidReward(rowIdOr{no,at}, reason?)◆紹介報酬の明細を取り消す（紹介した方の決済を返金したとき）。保留・確定・支払予定だけ（支払済は断る）。
                                        { no（紹介した方の会員番号）, at（返金した決済の日時） } で行を探せる。その人がこの会員の紹介でなければ
                                        何もせず { ok:true, other:true }。会員にお知らせ（額・どの決済の分か）→ { ok, row } / { ok:false, error }
   ―― ☆運営が直す中身（CMS。記録は state.cms。store.js が data.js の配列に重ねる。重ね方と記録の形は store.js の先頭）
     CMS_KINDS                          ['faculty'◆,'course','lesson','archive','gig','perk','event','notice']
                                        ◆学部（faculty：name・desc・img・alt。足すときは name）。下書き・削除の学部の講座は会員に出ない。cmsReorder('faculty', ids)
                                        ◆案件に place（現地の場所。60文字）、福利厚生に howType（''・code・card・site・account）、
                                        イベントの host に名簿の会員番号も（会員の企画から載せたとき）
     cmsUpsert(kind, obj)               足す・直す。obj.id が data.js か記録にあれば直す（欄を重ねる）、なければ足す（id は無ければ作る）。
                                        公開の状態は obj.publish（published/draft/hidden/scheduled）＋publishAt。案件以外は status にも書ける。
                                        回は obj.course に講座の id（別の講座へ移すときも course を変える）。足すときに要る欄：講座 title・faculty／
                                        回 title・course／録画 title・date・faculty／案件 title・type・reward／福利厚生 title・cat／イベント title・at／お知らせ text。
                                        案件・イベント・お知らせは checkBanned の言葉を断る。お知らせの link は #/ だけ、target は publishNotice と同じ書き方
                                        → { ok, id, item（cmsList の行の形）, added } / { ok:false, errors:{欄: 文} }
     cmsRemove(kind, id)                消す（data.js のものは削除の印。cmsUpsert で戻せる。足したものは記録ごと消す）→ { ok } / { ok:false, error }
     cmsReorder(kind, ids[], group?)    並べ直す。ids に書いたものどうしだけ入れ替わる。回は group に講座の id が要る（講座は学部・福利厚生は分類でも可）
     cmsList(kind, { course?, removed? })  運営画面の一覧：data.js の中身に記録を重ねたもの（下書き・非公開も入る）。各行に
                                        cms:{ publish, publishAt, visible（会員に見えるか）, edited, added, removed, savedAt }。回は course でしぼれる
     cmsItem(kind, id)                  1件（上の行の形）か null
     cmsReset()                         直した中身を全部消す（data.js の中身に戻る。運営のデモを最初に戻すとき）
     ※ 会員ページ・公開サイトの画面は今までどおり DATA.COURSES・DATA.FACULTIES などを読めばよい（会員に見えるものだけが入っている）。
       運営画面で下書きも並べるときは cmsList、data.js の元の中身は CLG.store.cmsBase(kind)

   ■ リンクの形（画面が作るもの。全部の一覧は docs/画面づくりの約束.md §5-10）
     #/feed/<投稿id>（コメントは ?c=<コメントid>）、#/members/<id>、#/events/<id>、#/gigs/<id>、#/lesson/<講座>/<回>、
     #/courses/<講座>、#/courses/archive/<録画>、#/courses/<講座>/certificate、#/help?focus=<id>、
     #/messages?kind=講座の質問&ref=lesson:<講座>/<回>（録画なら ref=archive:<録画>）
   ============================================================ */
(function (global) {
  'use strict';
  var CLG = global.CLG = global.CLG || {};
  var DATA = CLG.DATA;
  var S = function () { return CLG.store.state; };
  var MIN = 60000, DAY = 86400000;

  /* ---------- 小さな道具 ---------- */
  function byId(list, id) { if (!list) return null; for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i]; return null; }
  function now() { return CLG.now(); }
  function nowIso() { return CLG.now().toISOString(); }
  function sameDay(a, b) { a = new Date(a); b = new Date(b); return a.toDateString() === b.toDateString(); }
  function pad(n, w) { var s = String(n); while (s.length < (w || 2)) s = '0' + s; return s; }
  function str(x) { return String(x == null ? '' : x).trim(); }
  function plus(x, minutes) { return new Date(new Date(x).getTime() + minutes * MIN).toISOString(); }
  function plusDays(x, n) { var d = new Date(x); d.setDate(d.getDate() + n); return d; }
  function valid(x) { return x != null && x !== '' && !isNaN(new Date(x)); }
  function isPast(x) { return new Date(x) <= now(); }
  /** メッセージとお知らせを出してよい時刻か。入会直後の自動送信（数秒〜数分あと）はすぐ出し、
      翌朝10時の担当のあいさつのような先の時刻のものは、その時刻まで出さない */
  function isDue(x) { return new Date(x).getTime() <= now().getTime() + 5 * MIN; }
  function endOfDay(x) { var d = new Date(x); d.setHours(23, 59, 0, 0); return d; }
  function prevDay(x) { var d = new Date(x); d.setDate(d.getDate() - 1); return d; }
  function jpDate(x) { var d = new Date(x); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function md(x) { return DATA.md(x); }
  function mdw(x) { return DATA.mdw(x); }
  function hm(x) { return DATA.hm(x); }
  function keys(o) { return Object.keys(o || {}); }
  function copy(o) { var r = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; return r; }
  var _n = 0;
  /** その場で使うid（同じミリ秒に2つ作っても重ならない） */
  function uid(prefix) { _n = (_n + 1) % 1296; return prefix + Date.now().toString(36) + pad(_n.toString(36), 2); }
  /** v2 の状態に入れ物がなければ作る（ルールがあとから足した入れ物のため） */
  function slot(s, key, def) {
    if (s[key] == null || (Array.isArray(def) !== Array.isArray(s[key])) || typeof s[key] !== 'object') s[key] = def;
    return s[key];
  }
  /** 本文の頭（ポイントの理由に「◯◯さん「…」」と書くため。store と同じ切り方） */
  function head(text, n) {
    n = n || 26;
    var t = String(text || '').split('\n')[0];
    var q = t.search(/[？?。]/);
    if (q >= 0 && q < n) return t.slice(0, q + 1);
    return t.length > n ? t.slice(0, n) + '…' : t;
  }
  function update(fn) { return CLG.store.update(fn); }
  /* 運営画面（admin.html）が同じブラウザに残しているもの。会員ページからは読むだけ。
     保存の中身が変わっていなければ前に読んだものを使う（chrome() のたびに大きな JSON を読み直さないため） */
  var ADMIN_KEY = 'terakoya-admin-v1', ADMIN_OPEN_KEY = 'terakoya-admin-open';
  var admRaw = null, admDb = null;
  function lsGet(k) { try { return global.localStorage ? global.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function adminDb() {
    var raw = lsGet(ADMIN_KEY);
    if (raw !== admRaw) { admRaw = raw; try { admDb = raw ? JSON.parse(raw) : null; } catch (e) { admDb = null; } }
    return admDb && typeof admDb === 'object' ? admDb : null;
  }
  /** 運営画面が開いているか（運営画面が15秒ごとに時刻を書く。40秒以内なら開いている） */
  function adminOpen() {
    var t = +lsGet(ADMIN_OPEN_KEY);
    return !!t && Date.now() - t < 40000;
  }
  /** 画面を描き直さずに保存する（再生位置・メモのように何度も書くもの） */
  function quiet(fn) { var r = fn(S()); CLG.store.save(); return r; }
  function rule(id) { return byId(DATA.POINT_RULES, id) || { id: id, name: '', pt: 0 }; }
  /** 暦の月（off=0 今月、-1 先月）。ランキングとポイントは「9月の…」に合わせて1日〜月末で数える */
  function monthRange(off) {
    var n = now(), start = new Date(n.getFullYear(), n.getMonth() + (off || 0), 1);
    var end = new Date(n.getFullYear(), n.getMonth() + (off || 0) + 1, 1);
    return { start: start, end: end, month: start.getMonth() + 1, last: new Date(end.getTime() - 1) };
  }
  function inRange(at, r) { var t = new Date(at); return t >= r.start && t < r.end; }
  /** 文字のゆれをそろえる（全角半角・大文字小文字・カタカナとひらがな）。1文字ずつ直すので長さは変わらない */
  function nchar(c) {
    var x = c;
    if (x.normalize) { var y = x.normalize('NFKC'); if (y.length === 1) x = y; }
    var lo = x.toLowerCase(); if (lo.length === 1) x = lo;
    var code = x.charCodeAt(0);
    if (code >= 0x30a1 && code <= 0x30f6) x = String.fromCharCode(code - 0x60);
    return x;
  }
  function normText(t) { t = String(t == null ? '' : t); var o = ''; for (var i = 0; i < t.length; i++) o += nchar(t.charAt(i)); return o; }
  /** 全角の英数字を半角に（紹介コード・口座番号・会員番号の入力のため） */
  function halfWidth(t) {
    return String(t == null ? '' : t).replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).replace(/　/g, ' ');
  }

  /* ---------- 会員 ---------- */
  function me() { return S().me; }
  /** 入会から何日目か（入会日が1日目） */
  function day() {
    var j = new Date(me().joinedAt); j.setHours(0, 0, 0, 0);
    var n = now(); n.setHours(0, 0, 0, 0);
    return Math.floor((n - j) / DAY) + 1;
  }
  /** 在籍半年の会員は PEOPLE の m8 と同じ人（タイムラインの m8 は自分として扱う） */
  function myPersonId() { return me().personId || null; }
  function isMe(id) { return !!id && (id === 'me' || id === myPersonId() || id === me().id); }
  function profile() {
    var p = S().profile || {};
    return { nickname: p.nickname || '', visibility: VIS[p.visibility] ? p.visibility : 'pref', photo: p.photo || '' };
  }
  var VIS = { city: '市区町村まで', pref: '都道府県だけ', none: '出さない' };
  /** 公開範囲で地域を切る（決定事項：既定は都道府県まで） */
  function areaFor(area, vis) {
    area = str(area);
    if (!area || vis === 'none') return '';
    if (vis === 'city') return area;
    return area.split(/\s+/)[0];
  }
  function prefOf(area) { return str(area).split(/\s+/)[0] || ''; }
  var ROSTER_COLORS = ['#6a8caf', '#4f8a6b', '#b0875a', '#a0617f', '#7b8f4f', '#4e7f93', '#b8647a', '#6b7f5e', '#8f6aa8', '#5d8a8a', '#a57758', '#6f8fb0'];
  function rosterColor(no) { return ROSTER_COLORS[(parseInt(String(no).replace(/\D/g, ''), 10) || 0) % ROSTER_COLORS.length]; }

  function person(id) {
    var s = S();
    if (isMe(id)) {
      var m = s.me, pr = profile();
      return { id: 'me', me: true, no: m.id, name: str(pr.nickname) || m.name || '会員', realName: m.name || '',
        area: areaFor(m.area, pr.visibility), color: m.color, lv: level().lv, photo: pr.photo, job: m.job || '', visibility: pr.visibility };
    }
    var p = DATA.PEOPLE[id];
    if (p) {
      var o = copy(p);
      o.id = id;
      o.area = p.staff ? (p.area || '') : areaFor(p.area, p.visibility || 'pref');
      o.photo = p.photo || '';
      return o;
    }
    var r = DATA.ROSTER_INDEX && DATA.ROSTER_INDEX[id];
    if (r) return rosterPerson(r);
    return { id: id || '', name: '会員', color: '#8b867d', area: '', photo: '' };
  }
  /** 名簿（ROSTER）の1人を person の形に。名前のある人は PEOPLE から、デモ会員は MEMBER から */
  function rosterPerson(r) {
    if (!r) return null;
    if (r.person === 'demo') {
      if (S().kind === 'demo') { var pm = person('me'); pm.no = r.no; return pm; }
      var M = DATA.MEMBER;
      return { id: r.no, no: r.no, name: M.name, area: areaFor(M.area, 'pref'), color: M.color, lv: r.level, photo: '', job: M.job };
    }
    if (r.person && (DATA.PEOPLE[r.person] || isMe(r.person))) { var p = person(r.person); p.no = r.no; return p; }
    return { id: r.no, no: r.no, name: r.name, area: areaFor(r.area, 'pref'), color: rosterColor(r.no), lv: r.level, photo: '', job: r.job };
  }

  /** 入会した月（同期どうしで見つけやすくする）。「2026年9月入会」 */
  function cohort(at) { var j = new Date(at || me().joinedAt); return j.getFullYear() + '年' + (j.getMonth() + 1) + '月入会'; }
  function cohortKey(at) { var j = new Date(at); return j.getFullYear() + '-' + pad(j.getMonth() + 1); }
  /** 何週続けて学んでいるか（毎日ではなく週単位。忙しい人に罪悪感を持たせないため）。
      今週まだ何もしていなくても、先週まで続いていれば途切れない */
  function streak() {
    function weekStart(d) { d = new Date(d); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
    var weeks = {};
    S().xpLog.forEach(function (l) { weeks[weekStart(l.at)] = true; });
    var w = weekStart(now()), WEEK = 7 * DAY, n = 0, thisWeek = !!weeks[w];
    if (!thisWeek) w -= WEEK;
    while (weeks[w]) { n++; w -= WEEK; }
    return { weeks: n, thisWeek: thisWeek };
  }
  /** プロフィールで足りない欄（スタートガイドの「プロフィールを整える」とホームで同じ文を出す） */
  function missingFields() {
    var m = me(), list = [];
    if (!str(m.name)) list.push({ key: 'name', label: '名前' });
    if (!str(m.area)) list.push({ key: 'area', label: '地域' });
    if (!str(m.job)) list.push({ key: 'job', label: 'いまのお仕事' });
    return { list: list, keys: list.map(function (x) { return x.key; }),
      text: list.length ? '未入力：' + list.map(function (x) { return x.label; }).join('・') : '' };
  }

  /* ---------- 学びのレベル ---------- */
  function xp() { return S().xpLog.reduce(function (a, l) { return a + (l.xp || 0); }, 0); }
  function level(x) {
    if (x == null) x = xp();
    var L = DATA.LEVELS, cur = L[0], next = null;
    for (var i = 0; i < L.length; i++) { if (x >= L[i].min) { cur = L[i]; next = L[i + 1] || null; } }
    var pct = next ? (x - cur.min) / (next.min - cur.min) * 100 : 100;
    return { lv: cur.lv, name: cur.name, min: cur.min, xp: x, next: next, toNext: next ? next.min - x : 0, pct: pct };
  }
  function levelName(lv) { var x = DATA.LEVELS.filter(function (l) { return l.lv === lv; })[0]; return x ? x.name : ''; }
  function coursesAtLevel(lv) { return DATA.COURSES.filter(function (c) { return c.level === lv; }); }

  /** XPを足す。レベルが上がったら、開いた講座も返す（store.update の中で呼ぶ） */
  function addXp(s, amount, why, link) {
    var before = level();
    var e = { at: nowIso(), xp: amount, why: why };
    if (link) e.link = link;
    s.xpLog.push(e);
    var after = level();
    var r = { xp: amount, why: why, levelUp: null };
    if (after.lv > before.lv) {
      var unlocked = [];
      for (var lv = before.lv + 1; lv <= after.lv; lv++) unlocked = unlocked.concat(coursesAtLevel(lv));
      // 応募できるようになった案件：上がったレベルで開くもので、講座の修了の条件も満たすもの（募集中だけ）
      var gigs = DATA.GIGS.filter(function (g) {
        return g.level > before.lv && g.level <= after.lv && !gigClosed(g) && !gigLock(g).locked;
      });
      r.levelUp = { from: before.lv, to: after.lv, name: after.name, unlocked: unlocked, gigs: gigs };
    }
    return r;
  }
  /** 2つの result をまとめる（関数ごとの値も残す） */
  function merge(a, b) {
    if (!a) return b; if (!b) return a;
    var r = Object.assign({}, a, b);
    r.xp = (a.xp || 0) + (b.xp || 0);
    r.why = a.why || b.why;
    r.levelUp = b.levelUp || a.levelUp || null;
    r.courseCompleted = a.courseCompleted || b.courseCompleted;
    r.steps = (a.steps || []).concat(b.steps || []);
    if (a.pt || b.pt) { r.pt = (a.pt || 0) + (b.pt || 0); r.ptWhy = a.ptWhy || b.ptWhy; }
    return r;
  }

  /* ---------- 講座 ---------- */
  function course(id) { return byId(DATA.COURSES, id); }
  function findLesson(lessonId) {
    for (var i = 0; i < DATA.COURSES.length; i++) {
      var c = DATA.COURSES[i];
      for (var j = 0; j < c.lessons.length; j++) if (c.lessons[j].id === lessonId) return { c: c, l: c.lessons[j], n: j + 1 };
    }
    return null;
  }
  function courseState(c) {
    if (typeof c === 'string') c = course(c);
    var s = S(), lv = level().lv;
    var done = c.lessons.filter(function (l) { return s.done[l.id]; }).length;
    var next = null;
    for (var i = 0; i < c.lessons.length; i++) { if (!s.done[c.lessons[i].id]) { next = c.lessons[i]; break; } }
    var locked = c.level > lv;
    return {
      locked: locked,
      lockReason: locked ? 'Lv' + c.level + '「' + levelName(c.level) + '」で開きます' : '',
      done: done, total: c.lessons.length, pct: done / c.lessons.length * 100,
      completed: done === c.lessons.length, started: done > 0, next: next,
      minutes: c.lessons.reduce(function (a, l) { return a + l.min; }, 0),
      left: c.lessons.filter(function (l) { return !s.done[l.id]; }).reduce(function (a, l) { return a + l.min; }, 0)
    };
  }
  /** 'done' / 'open' / 'locked'。講座の中は1本ずつ順に開く */
  function lessonState(c, lessonId) {
    if (typeof c === 'string') c = course(c);
    var s = S();
    if (!c || c.level > level().lv) return 'locked';
    for (var i = 0; i < c.lessons.length; i++) {
      if (c.lessons[i].id !== lessonId) continue;
      if (s.done[lessonId]) return 'done';
      if (i === 0 || s.done[c.lessons[i - 1].id]) return 'open';
      return 'locked';
    }
    return 'locked';
  }
  /** 修了したことがあるか。全回を見終えたか、修了証をもう受け取っている（修了のあとで運営が回を足しても、修了は消えない） */
  function certified(c) {
    if (typeof c === 'string') c = course(c);
    if (!c) return false;
    return !!(S().certificates || {})[c.id] || courseState(c).completed;
  }
  /** 修了証の番号：会員番号-修了した順の2桁（store の certify と同じ付け方） */
  function issueCertificate(s, c) {
    var certs = slot(s, 'certificates', {});
    if (certs[c.id]) return certs[c.id];
    certs[c.id] = { no: s.me.id + '-' + pad(keys(certs).length + 1, 2), at: nowIso() };
    return certs[c.id];
  }
  function completeLesson(courseId, lessonId) {
    var c = course(courseId), l = c && byId(c.lessons, lessonId);
    if (!l || lessonState(c, lessonId) !== 'open') return null;
    var r = update(function (s) {
      s.done[lessonId] = nowIso();
      if (s.lessonPos) delete s.lessonPos[lessonId];
      var x = addXp(s, DATA.XP.lesson, '講座「' + c.title + '」' + l.title, '#/lesson/' + c.id + '/' + l.id);
      if (courseState(c).completed) { x.courseCompleted = c; x.certificate = issueCertificate(s, c); }
      return x;
    });
    return merge(r, syncSteps());
  }
  /** 続きから見る講座（始めていて終わっていないもの → なければ開いていて未着手のもの） */
  function continueList() {
    var list = DATA.COURSES.map(function (c) { return { c: c, st: courseState(c) }; })
      .filter(function (x) { return !x.st.locked && !x.st.completed; });
    list.sort(function (a, b) { return (b.st.started - a.st.started) || (a.c.level - b.c.level); });
    return list;
  }
  function seeArchive(id) {
    var a = byId(DATA.ARCHIVE, id);
    if (!a || S().archiveSeen[id]) return null;
    return update(function (s) {
      s.archiveSeen[id] = nowIso();
      return addXp(s, DATA.XP.archive, '勉強会の録画「' + a.title + '」', '#/courses/archive/' + a.id);
    });
  }
  /** 再生の位置（秒）。sec を渡すと保存する。何度も呼ばれるので画面は描き直さない */
  function lessonPos(lessonId, sec) {
    var f = findLesson(lessonId);
    if (sec === undefined) { var v = (S().lessonPos || {})[lessonId]; return typeof v === 'number' && v > 0 ? v : 0; }
    var max = f ? f.l.min * 60 : 3600;
    sec = Math.max(0, Math.min(max, Math.floor(Number(sec) || 0)));
    return quiet(function (s) {
      var pos = slot(s, 'lessonPos', {});
      if (!sec || S().done[lessonId]) delete pos[lessonId]; else pos[lessonId] = sec;
      return sec;
    });
  }
  function resumeText(lessonId) {
    var sec = lessonPos(lessonId);
    if (!sec || S().done[lessonId]) return '';
    return '前回の続き ' + Math.floor(sec / 60) + ':' + pad(sec % 60) + ' から';
  }
  /** 講座のメモ（会員ごと）。text を渡すと保存（2000文字まで） */
  function lessonNote(lessonId, text) {
    if (text === undefined) return String((S().notes || {})[lessonId] || '');
    text = String(text == null ? '' : text).slice(0, 2000);
    return quiet(function (s) {
      var n = slot(s, 'notes', {});
      if (text.trim()) n[lessonId] = text; else delete n[lessonId];
      return text;
    });
  }

  /* 確認テスト（決定事項：講座の最後に3問。修了の条件にはしない。合格でXP） */
  /** 間違えた問いから戻る回。データに lesson があればそれ、なければ解説の「第N回」から */
  function quizLesson(c, item) {
    var id = item.lesson;
    if (!id) { var m = /第(\d+)回/.exec(item.why || ''); if (m && c.lessons[+m[1] - 1]) id = c.lessons[+m[1] - 1].id; }
    var l = id && byId(c.lessons, id);
    return l ? { id: l.id, title: l.title, href: '#/lesson/' + c.id + '/' + l.id } : null;
  }
  function quiz(courseId) {
    var c = course(courseId);
    if (!c || !c.quiz || !c.quiz.length) return null;
    var st = courseState(c);
    return {
      course: { id: c.id, title: c.title },
      questions: c.quiz.map(function (x, i) { return { i: i, q: x.q, choices: x.choices.slice() }; }),
      total: c.quiz.length, pass: Math.min(DATA.QUIZ_PASS || 2, c.quiz.length),
      ready: st.completed, locked: st.locked, result: (S().quiz || {})[c.id] || null
    };
  }
  function submitQuiz(courseId, answers) {
    var c = course(courseId);
    if (!c || !c.quiz || courseState(c).locked) return null;
    answers = answers || [];
    var results = c.quiz.map(function (x, i) {
      var chosen = answers[i] == null || answers[i] === '' ? null : +answers[i];
      return { i: i, chosen: chosen, answer: x.answer, correct: chosen === x.answer, why: x.why || '', lesson: quizLesson(c, x) };
    });
    var score = results.filter(function (r) { return r.correct; }).length;
    var pass = Math.min(DATA.QUIZ_PASS || 2, c.quiz.length), passed = score >= pass;
    var prev = (S().quiz || {})[c.id];
    var firstPass = passed && !(prev && prev.passed);
    var r = update(function (s) {
      var q = slot(s, 'quiz', {});
      q[c.id] = { score: score, total: c.quiz.length, passed: passed || !!(prev && prev.passed), at: nowIso() };
      return firstPass ? addXp(s, DATA.XP.quiz, '確認テストに合格（' + c.title + '）', '#/courses/' + c.id) : { xp: 0 };
    });
    return Object.assign(r, { score: score, total: c.quiz.length, passed: passed, firstPass: firstPass, results: results });
  }
  /** 修了証。一度出したもの（state.certificates）は、あとで運営が回を足して「全回」に届かなくなっても出す */
  function certificate(courseId) {
    var c = course(courseId);
    if (!c) return null;
    var s = S(), cert = (s.certificates || {})[c.id];
    if (!cert && !courseState(c).completed) return null;
    if (!cert) {
      // 修了証がまだない（古い状態から直したときなど）：見終えた時刻の順で番号を付ける
      var done = DATA.COURSES.filter(function (x) { return courseState(x).completed; }).map(function (x) {
        return { id: x.id, at: x.lessons.map(function (l) { return s.done[l.id]; }).sort().pop() };
      }).sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
      var i = 0; done.forEach(function (x, k) { if (x.id === c.id) i = k; });
      cert = { no: s.me.id + '-' + pad(i + 1, 2), at: done[i] ? done[i].at : nowIso() };
    }
    return { no: cert.no, date: cert.at, course: { id: c.id, title: c.title }, name: me().name, memberNo: me().id, teacher: person(c.teacher).name };
  }
  /** 修了した講座の数。ほかの人は記録を持たないので、XP のおよそ半分が講座（1回20XP・1講座4〜5回）として見込む */
  function completedCount(personId) {
    if (!personId || isMe(personId)) return DATA.COURSES.filter(certified).length;
    var p = DATA.PEOPLE[personId], r = DATA.ROSTER_INDEX && DATA.ROSTER_INDEX[personId];
    if (p && p.staff) return 0;
    var x = p ? p.xp : r ? r.xp : 0;
    return Math.min(DATA.COURSES.length, Math.floor((x || 0) * 0.55 / 20 / 4.6));
  }

  /* ---------- スタートガイド（最初の30日） ---------- */
  function autoDone(step) {
    var s = S();
    if (!step.auto) return false;
    var p = step.auto.split(':');
    if (p[0] === 'course') return certified(p[1]);
    if (p[0] === 'lessons') return keys(s.done).length >= +p[1];
    if (p[0] === 'post') return s.posts.some(function (x) { return x.kind === p[1]; });
    if (p[0] === 'gig') return keys(s.gigs).length > 0;
    if (p[0] === 'event' && p[1] === 'any') return s.attended.length > 0;
    if (p[0] === 'event' && p[1] === 'showcase') {
      return s.attended.some(function (a) { var e = event(a.id); return a.kind === 'showcase' || (e && e.kind === 'showcase'); });
    }
    return false;
  }
  function nextShowcase() { return upcoming().filter(function (e) { return e.kind === 'showcase'; })[0] || null; }
  function steps() {
    var s = S(), sc = nextShowcase();
    return DATA.ONBOARDING.map(function (st) {
      var o = Object.assign({}, st, { done: !!s.steps[st.id], doneAt: s.steps[st.id] || null });
      if (st.id === 'showcase') {
        // 成果発表会は週ごとの並びの外に出して、次の日付で呼ぶ
        o.baseTitle = st.title; o.outside = true;
        o.event = sc ? sc.id : null; o.eventAt = sc ? sc.at : null;
        if (!o.done && sc) o.title = '次の成果発表会（' + md(sc.at) + '）';
      }
      return o;
    });
  }
  function onboarding() {
    var list = steps();
    var done = list.filter(function (x) { return x.done; }).length;
    var weeks = [1, 2, 3, 4].map(function (n) {
      return { n: n, steps: list.filter(function (x) { return x.week === n && !x.outside; }) };
    }).filter(function (w) { return w.steps.length; });
    return { steps: list, weeks: weeks, showcase: list.filter(function (x) { return x.outside; })[0] || null,
      done: done, total: list.length, pct: done / list.length * 100, day: day(),
      current: list.filter(function (x) { return !x.done; })[0] || null, finished: done === list.length, missing: missingFields() };
  }
  /** 自動で済になる項目を確かめて、済にしたものにXPを付ける */
  function syncSteps() {
    var newly = DATA.ONBOARDING.filter(function (st) { return !S().steps[st.id] && autoDone(st); });
    if (!newly.length) return null;
    return update(function (s) {
      var r = null;
      newly.forEach(function (st) {
        s.steps[st.id] = nowIso();
        var x = addXp(s, st.xp, 'スタートガイド「' + st.title + '」', '#/start');
        x.steps = [st];
        r = merge(r, x);
      });
      return r;
    });
  }
  /** 手で済にする項目（プロフィール・LINE・目標・面談） */
  function completeStep(id) {
    var st = byId(DATA.ONBOARDING, id);
    if (!st || S().steps[id]) return null;
    return update(function (s) {
      s.steps[id] = nowIso();
      var x = addXp(s, st.xp, 'スタートガイド「' + st.title + '」', '#/start');
      x.steps = [st];
      return x;
    });
  }
  function setGoal(what, by) {
    update(function (s) { s.goal30 = { what: what, by: by, at: nowIso() }; s.me.goal = what; });
    return completeStep('goal');
  }

  /* プロフィール */
  var PROFILE_KEYS = { nickname: 1, visibility: 1, photo: 1 };
  var PHOTO_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/;
  var PHOTO_MAX = 700000;   // data URL の長さ（localStorage は1つの保存先で5MBほど）
  function validateProfile(patch) {
    patch = patch || {}; var e = {};
    if ('name' in patch) { var n = str(patch.name); if (!n) e.name = '名前を入れてください'; else if (n.length > 30) e.name = '30文字までにしてください'; }
    if ('nickname' in patch && str(patch.nickname).length > 20) e.nickname = '20文字までにしてください';
    if ('visibility' in patch && !VIS[patch.visibility]) e.visibility = '地域の出し方を選んでください';
    if ('photo' in patch && patch.photo) {
      if (!PHOTO_RE.test(String(patch.photo))) e.photo = '写真はJPEGかPNGの画像を選んでください';
      else if (String(patch.photo).length > PHOTO_MAX) e.photo = '写真が大きすぎます。小さくしてから選んでください';
    }
    if ('area' in patch && str(patch.area).length > 40) e.area = '40文字までにしてください';
    if ('job' in patch && str(patch.job).length > 40) e.job = '40文字までにしてください';
    if ('goal' in patch && str(patch.goal).length > 120) e.goal = '120文字までにしてください';
    return { ok: !keys(e).length, errors: e };
  }
  function saveProfile(patch) {
    patch = patch || {};
    var mail = 'email' in patch ? str(patch.email) : null;
    update(function (s) {
      var pr = slot(s, 'profile', { nickname: '', visibility: 'pref', photo: '' });
      keys(patch).forEach(function (k) {
        if (k === 'email') return;
        if (PROFILE_KEYS[k]) {
          if (k === 'visibility' && !VIS[patch[k]]) return;
          if (k === 'photo' && patch[k] && (!PHOTO_RE.test(String(patch[k])) || String(patch[k]).length > PHOTO_MAX)) return;
          pr[k] = k === 'photo' ? (patch[k] || '') : str(patch[k]);
          return;
        }
        s.me[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
      });
    });
    // メールアドレスは確認されるまで今のまま（確認のメールを送る）
    if (mail !== null && mail && mail.toLowerCase() !== String(me().email || '').toLowerCase()) requestEmailChange(mail);
    // 通知の切り替えなど、プロフィール以外を保存したときは済にしない
    var touched = ['name', 'area', 'job'].some(function (k) { return k in patch; });
    if (touched && !missingFields().list.length) return completeStep('profile');
    return null;
  }

  /* LINE の連携（none → pending → linked / failed）。本番は LINE ログインのコールバックで linked にする */
  var LINE_LABEL = { none: '未連携', pending: '連携の途中', linked: '連携済み', failed: '連携できませんでした' };
  function lineLink() {
    var s = S(), l = s.lineLink || { status: 'none', at: null };
    // v1 の状態（me.lineLinked だけ持っていた）と食い違うときは、me.lineLinked に合わせる
    if (s.me.lineLinked && l.status === 'none') l = { status: 'linked', at: l.at || null };
    if (!s.me.lineLinked && l.status === 'linked') l = { status: 'none', at: null };
    return Object.assign({ label: LINE_LABEL[l.status] || '' }, l);
  }
  function startLineLink() {
    // 連携コード：パソコンで開いたとき、LINE の画面に打ち込む6桁
    var code = String(100000 + Math.floor(Math.random() * 900000));
    // つなぎ直すときは、前の連携を外してから（通知が古いアカウントに届かないように）
    update(function (s) { s.lineLink = { status: 'pending', at: nowIso(), code: code }; s.me.lineLinked = false; });
    return lineLink();
  }
  function finishLineLink(ok) {
    if (ok === false) {
      update(function (s) { s.lineLink = { status: 'failed', at: nowIso() }; s.me.lineLinked = false; });
      return { xp: 0, status: 'failed' };
    }
    update(function (s) { s.lineLink = { status: 'linked', at: nowIso() }; s.me.lineLinked = true; });
    return completeStep('line') || { xp: 0, status: 'linked' };
  }
  function unlinkLine() {
    update(function (s) { s.lineLink = { status: 'none', at: nowIso() }; s.me.lineLinked = false; });
    return lineLink();
  }
  function linkLine(on) {
    if (on === false) { unlinkLine(); return null; }
    var r = finishLineLink(true);
    return r && r.steps ? r : null;
  }

  /** 紹介コードを名簿と照らす（公開サイトの申込み）。名前は返さない */
  function validateRefCode(code) {
    var raw = str(code);
    if (!raw) return { ok: true, empty: true, code: '', message: '' };
    var c = halfWidth(raw).replace(/[\s\-_]/g, '').toUpperCase();
    var NG = '見つかりません（空欄でも申込めます）', OK = '有効な紹介コードです';
    if (!/^[A-Z]{2,8}\d{3}$/.test(c)) return { ok: false, code: c, message: NG };
    var known = [DATA.MEMBER.refCode, DATA.VETERAN.refCode, me().refCode].map(function (x) { return String(x || '').toUpperCase(); });
    if (known.indexOf(c) >= 0) return { ok: true, code: c, message: OK };
    // 紹介コードの下3桁は会員番号の下3桁（store の freshState と同じ決まり）
    var r = DATA.ROSTER_INDEX && DATA.ROSTER_INDEX['TS-' + pad(parseInt(c.slice(-3), 10), 6)];
    if (r && r.status !== 'left') return { ok: true, code: c, message: OK };
    return { ok: false, code: c, message: NG };
  }

  /* ---------- タイムライン ---------- */
  /** FEED と自分の投稿（state.posts）と、運営画面から出した運営の投稿（state.staffPosts）を1つに */
  function staffPostsRaw() {
    return (S().staffPosts || []).map(function (p) { return Object.assign({ likes: 0, comments: 0, replies: [] }, p, { staffPost: true }); });
  }
  function rawPosts() {
    var mine = (S().posts || []).map(function (p) { return Object.assign({ by: 'me' }, p, { mine: true }); });
    return DATA.FEED.concat(staffPostsRaw(), mine);
  }
  function findRawPost(id) {
    return byId(DATA.FEED, id) || byId(staffPostsRaw(), id) ||
      (function () { var p = byId(S().posts, id); return p ? Object.assign({ by: 'me' }, p, { mine: true }) : null; })();
  }
  function hiddenOf(id) { return (S().hiddenPosts || {})[id] || null; }
  function postVisible(p) { var s = S(); return !s.deleted[p.id] && !hiddenOf(p.id) && !(s.mutes || {})[p.by] && isPast(p.at); }
  /** コメントの元（投稿に付いている返信と、自分のコメント） */
  function commentPool(postId) {
    var s = S(), p = findRawPost(postId), out = [];
    ((p && p.replies) || []).forEach(function (r) { out.push(Object.assign({ postId: postId, source: 'data' }, r)); });
    (s.comments || []).forEach(function (c) { if (c.postId === postId) out.push(Object.assign({ source: 'me' }, c, { by: 'me' })); });
    return out;
  }
  /** 見えるコメントか。運営が隠したコメントは、書いた本人にだけ見せる（shapeComment が hidden を付ける） */
  function commentVisible(c) {
    var s = S();
    if (s.deleted[c.id] || (s.mutes || {})[c.by] || !isPast(c.at)) return false;
    return !(s.hiddenComments || {})[c.id] || c.source === 'me' || isMe(c.by);
  }
  function commentCount(postId) { return commentPool(postId).filter(commentVisible).length; }
  /** 固定しているか。運営が固定・外した印（state.pins）があればそれ、なければ投稿の pinned（data.js・運営の投稿の記録） */
  function pinnedOf(p) {
    var x = (S().pins || {})[p.id];
    return x && typeof x === 'object' ? !!x.on : !!p.pinned;
  }
  function decorate(p) {
    var s = S(), ed = (s.postEdits || {})[p.id], liked = !!s.likes[p.id];
    var o = Object.assign({}, p);
    o.pinned = pinnedOf(p);
    o.mine = !!p.mine || isMe(p.by);
    if (ed) { o.text = ed.text; o.edited = true; o.editedAt = ed.at; }
    // data.js の likes は「自分以外」の数。自分が押していれば1足す
    o.liked = liked; o.likeCount = (p.likes || 0) + (liked ? 1 : 0);
    o.comments = commentCount(p.id);
    o.muted = !!(s.mutes || {})[p.by];
    return o;
  }
  var KIND_GROUPS = { staff: ['news', 'new', 'gig', 'event'] };
  function kindMatch(p, kind, legacy) {
    if (!kind || kind === 'all') return true;
    if (kind === 'mine') return !!p.mine || isMe(p.by);
    if (KIND_GROUPS[kind]) return KIND_GROUPS[kind].indexOf(p.kind) >= 0;
    if (legacy && kind === 'post') return p.kind === 'post' || p.kind === 'intro';
    return p.kind === kind;
  }
  function feed(arg) {
    var paged = !!arg && typeof arg === 'object';
    var kind = paged ? arg.kind : arg;
    var all = rawPosts().filter(postVisible).filter(function (p) { return kindMatch(p, kind, !paged); }).map(decorate);
    // 固定した投稿を先頭に（固定どうしは新しい順）
    all.sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.at) - new Date(a.at); });
    if (!paged) return all;
    var size = Math.max(1, Math.floor(+arg.pageSize || 15)), pages = Math.max(1, Math.ceil(all.length / size));
    var page = Math.min(pages, Math.max(1, Math.floor(+arg.page || 1)));
    return { items: all.slice((page - 1) * size, page * size), shown: all.slice(0, page * size), total: all.length,
      page: page, pages: pages, pageSize: size, hasMore: page * size < all.length };
  }
  function post(id) {
    var p = findRawPost(id);
    if (!p || S().deleted[id] || !isPast(p.at)) return null;
    // 運営が隠した投稿は、書いた本人にだけ（理由つきで）見せる
    var h = hiddenOf(id);
    if (h && !(p.mine || isMe(p.by))) return null;
    var o = decorate(p);
    if (h) o.hidden = { at: h.at, reason: h.reason || '' };
    return o;
  }
  function toggleLike(postId) {
    update(function (s) { if (s.likes[postId]) delete s.likes[postId]; else s.likes[postId] = true; });
    return !!S().likes[postId];
  }
  /* 写真（プロトタイプは data URL のまま state に入れる。保存先が5MBほどなので小さくしてから） */
  var imageLimit = { max: 4, bytes: 600000 };
  function validateImages(list) {
    var out = [], err = '';
    (list || []).forEach(function (x) {
      var src = typeof x === 'string' ? x : x && x.src, alt = x && typeof x === 'object' ? str(x.alt) : '';
      if (!src) return;
      if (!PHOTO_RE.test(src) && !/^assets\/img\/[\w\-./]+$/.test(src)) { err = err || '画像のファイルを選んでください（JPEG・PNG）'; return; }
      if (src.length > imageLimit.bytes) { err = err || '写真が大きすぎます。1枚' + Math.round(imageLimit.bytes / 1000) + 'KBまでにしてください'; return; }
      out.push({ src: src, alt: alt });
    });
    if (out.length > imageLimit.max) { err = err || '写真は' + imageLimit.max + '枚までです'; out = out.slice(0, imageLimit.max); }
    return { ok: !err, error: err, images: out };
  }
  var POST_KINDS = { post: 1, question: 1, win: 1, intro: 1 };
  /** 投稿する。kind: post（近況）/ question / win（成果報告）/ intro。XPは1日3回まで */
  function addPost(text, kind, images) {
    text = str(text);
    if (!text) return null;
    kind = POST_KINDS[kind] ? kind : 'post';
    var imgs = validateImages(images).images;
    var id = uid('my');
    var r = update(function (s) {
      var todays = s.posts.filter(function (p) { return sameDay(p.at, now()); });
      var winToday = todays.some(function (p) { return p.kind === 'win'; });
      var p = { id: id, kind: kind, text: text, at: nowIso(), likes: 0, comments: 0, replies: [] };
      if (imgs.length) p.images = imgs;
      s.posts.push(p);
      var x = todays.length < DATA.XP.postPerDay ? addXp(s, DATA.XP.post, 'タイムラインに投稿', '#/feed/' + id) : { xp: 0 };
      if (kind === 'win' && !winToday) {
        var ru = rule('win');
        if (ru.pt) { s.pointsLog.push({ at: nowIso(), pt: ru.pt, rule: 'win', why: '成果を報告した（' + head(text, 20) + '）', link: '#/feed/' + id }); x.pt = ru.pt; x.ptWhy = ru.name; }
      }
      x.post = id;
      return x;
    });
    return merge(r, syncSteps());
  }
  function mineRaw(id) { var p = findRawPost(id); return p && (p.mine || isMe(p.by)) ? p : null; }
  function editPost(id, text) {
    text = str(text);
    if (!text || !mineRaw(id) || S().deleted[id]) return false;
    update(function (s) { slot(s, 'postEdits', {})[id] = { text: text, at: nowIso() }; });
    return true;
  }
  function deletePost(id) {
    if (!mineRaw(id)) return false;
    update(function (s) { s.deleted[id] = nowIso(); });
    return true;
  }
  var REPORT_REASONS = ['勧誘・営業', '収入を約束する書き方', '人を傷つける内容', '個人情報が書かれている', 'その他'];
  function reportPost(postId, reason, commentId) {
    var p = findRawPost(postId);
    if (!p) return { ok: false, error: '投稿が見つかりません' };
    // 自分の投稿そのものは通報できない。自分の投稿に付いた、ほかの人のコメントは通報できる
    if (!commentId && (p.mine || isMe(p.by))) return { ok: false, error: '自分の投稿は通報できません' };
    if (commentId) {
      var f = findComment(commentId);
      if (!f || f.postId !== postId) return { ok: false, error: 'コメントが見つかりません' };
      if (isMe(f.c.by) || f.source === 'me') return { ok: false, error: '自分のコメントは通報できません' };
    }
    reason = str(reason) || 'その他';
    // 同じものをもう一度通報したときは、受付中の通報を返す（運営の列に2つ並べない）
    var open = (S().reports || []).filter(function (x) { return x.postId === postId && (x.commentId || null) === (commentId || null) && x.status === '受付'; })[0];
    if (open) return { ok: true, report: open, existing: true };
    var rep = { id: uid('rp'), postId: postId, commentId: commentId || null, reason: reason, at: nowIso(), status: '受付' };
    update(function (s) { slot(s, 'reports', []).push(rep); });
    return { ok: true, report: rep };
  }
  function mutePerson(personId) {
    var p = DATA.PEOPLE[personId];
    if (!personId || isMe(personId) || (p && p.staff)) return false;
    update(function (s) { slot(s, 'mutes', {})[personId] = nowIso(); });
    return true;
  }
  function unmutePerson(personId) { update(function (s) { delete slot(s, 'mutes', {})[personId]; }); return true; }
  function mutes() {
    var m = S().mutes || {};
    return keys(m).map(function (id) { return { id: id, at: m[id], who: person(id) }; })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  function introText() {
    var m = me();
    return DATA.INTRO_TEMPLATE.replace('{name}', m.name || '').replace('{area}', m.area || '').replace('{job}', m.job || '').replace('{goal}', m.goal || '');
  }

  /* ---------- コメントと「ありがとう」 ----------
     返信は1段だけ。「ありがとう」はコメントに付けるボタン（投稿は「いいね」）。
     ありがとう：書いた人に +2pt（1つのコメントに1回・自分のコメントには押せない）
     運営が回答に選んだコメント：書いた人に +10pt「質問に答えた」 */
  function findComment(id) {
    if (!id) return null;
    var s = S(), i, j;
    for (i = 0; i < (s.comments || []).length; i++) if (s.comments[i].id === id) return { c: s.comments[i], postId: s.comments[i].postId, source: 'me' };
    var posts = rawPosts();
    for (i = 0; i < posts.length; i++) {
      var r = posts[i].replies || [];
      for (j = 0; j < r.length; j++) if (r[j].id === id) return { c: r[j], postId: posts[i].id, source: 'data' };
    }
    return null;
  }
  function shapeComment(c) {
    var s = S(), marks = s.answerMarks || {};
    var mine = c.source === 'me' || isMe(c.by), thanked = !!(s.thanks || {})[c.id];
    var o = { id: c.id, postId: c.postId, by: mine ? 'me' : c.by, who: person(mine ? 'me' : c.by), at: c.at, text: c.text,
      replyTo: c.replyTo || null, answer: !!c.answer || !!marks[c.id], thanks: (c.thanks || 0) + (thanked ? 1 : 0),
      thanked: thanked, mine: mine, canThank: !mine && !thanked, replies: [] };
    var h = (s.hiddenComments || {})[c.id];
    if (h) { o.hidden = { at: h.at, reason: h.reason || '' }; o.canThank = false; }
    return o;
  }
  function comments(postId) {
    var all = commentPool(postId).filter(commentVisible).map(shapeComment);
    all.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    var map = {}, top = [];
    all.forEach(function (c) { map[c.id] = c; });
    all.forEach(function (c) {
      var parent = c.replyTo ? map[c.replyTo] : null, guard = 0;
      // 返信への返信は、いちばん上のコメントへの返信にそろえる
      while (parent && parent.replyTo && map[parent.replyTo] && guard++ < 10) parent = map[parent.replyTo];
      if (parent && parent !== c) { c.parent = parent.id; parent.replies.push(c); } else top.push(c);
    });
    return top;
  }
  function rootOf(postId, commentId) {
    var f = findComment(commentId);
    if (!f || f.postId !== postId) return null;
    var c = f.c, guard = 0;
    while (c && c.replyTo && guard++ < 10) { var up = findComment(c.replyTo); if (!up || up.postId !== postId) break; c = up.c; }
    return c ? c.id : null;
  }
  function addComment(postId, text, replyToId) {
    text = str(text);
    var p = findRawPost(postId);
    if (!text) return { ok: false, error: 'コメントを入れてください' };
    if (text.length > 1000) return { ok: false, error: '1000文字までにしてください' };
    if (!p || S().deleted[postId]) return { ok: false, error: '投稿が見つかりません' };
    var parent = replyToId ? rootOf(postId, replyToId) : null;
    var author = person(p.by);
    // 新入生への声かけ：30日以内の自己紹介に、はじめてコメントしたとき
    var welcome = p.kind === 'intro' && !isMe(p.by) && !author.staff && (now() - new Date(p.at)) / DAY <= 30 &&
      !commentPool(postId).some(function (c) { return c.source === 'me' || isMe(c.by); });
    var id = uid('c');
    return update(function (s) {
      slot(s, 'comments', []).push({ id: id, postId: postId, replyTo: parent, by: 'me', at: nowIso(), text: text, answer: false, thanks: 0, thanksFrom: [] });
      var r = { ok: true, xp: 0, id: id, parent: parent };
      if (welcome) {
        var ru = rule('welcome');
        s.pointsLog.push({ at: nowIso(), pt: ru.pt, rule: 'welcome', why: '新入生に声をかけた（' + author.name + 'さんの自己紹介）', link: '#/feed/' + postId + '?c=' + id });
        r.pt = ru.pt; r.ptWhy = ru.name;
      }
      return r;
    });
  }
  function deleteComment(commentId) {
    var f = findComment(commentId);
    if (!f || f.source !== 'me') return false;
    update(function (s) { s.deleted[commentId] = nowIso(); });
    return true;
  }
  function thankComment(commentId) {
    var f = findComment(commentId);
    if (!f || f.source === 'me' || isMe(f.c.by) || (S().thanks || {})[commentId]) return null;
    var who = person(f.c.by);
    update(function (s) { slot(s, 'thanks', {})[commentId] = nowIso(); });
    // pt は書いた人に入る。result の pt（自分に付いた pt）には入れない（reward() が「+2pt」と出してしまうため）
    return { ok: true, xp: 0, id: commentId, to: who, toPt: who.staff ? 0 : rule('thanks').pt };
  }

  /* ---------- 会員名簿 ---------- */
  var FAC_WORDS = [
    ['sns', /Instagram|SNS|発信|ショート動画|美容|撮影|リール/],
    ['sales', /営業|紹介|フロント|販売|アポ/],
    ['biz', /経営|起業|店長|ショップ|民泊|自営業|整体院/],
    ['skill', /動画|編集|AI|デザイン|ライター|ライティング|IT|エンジニア|ノーコード|Web|事務/],
    ['basic', /主婦|育休|パート|確定申告|お小遣い/]
  ];
  /** いま学んでいる学部（名簿の絞り込み用）。仕事と紹介文から見当をつけ、決まらなければ番号で振り分ける */
  function facultyOf(text, no) {
    for (var i = 0; i < FAC_WORDS.length; i++) if (FAC_WORDS[i][1].test(text || '')) return FAC_WORDS[i][0];
    var f = DATA.FACULTIES;
    return f[(parseInt(String(no || '').replace(/\D/g, ''), 10) || 0) % f.length].id;
  }
  function myFaculty() {
    var s = S(), last = null;
    keys(s.done).forEach(function (id) { if (!last || new Date(s.done[id]) > new Date(s.done[last])) last = id; });
    var f = last && findLesson(last);
    return f ? f.c.faculty : 'basic';
  }
  function dirRow(p, r) {
    var s = S(), meRow = !!p.me, P = !meRow && DATA.PEOPLE[p.id];
    var joined = meRow ? s.me.joinedAt : r ? r.joinedAt : nowIso();
    var vis = meRow ? profile().visibility : P ? (P.visibility || 'pref') : 'pref';
    var full = meRow ? s.me.area : P ? P.area : r ? r.area : '';
    var job = meRow ? s.me.job : (P && P.job) || (r && r.job) || '';
    return { id: meRow ? 'me' : p.id, no: meRow ? s.me.id : (r ? r.no : p.no || ''), name: p.name, me: meRow, color: p.color, photo: p.photo || '',
      lv: meRow ? level().lv : (p.lv || (r && r.level) || 1), area: areaFor(full, vis), pref: vis === 'none' ? '' : prefOf(full),
      cohort: cohort(joined), cohortKey: cohortKey(joined), joinedAt: joined, job: job,
      faculty: meRow ? myFaculty() : facultyOf(job + ' ' + ((P && P.bio) || ''), r ? r.no : p.id),
      href: '#/members/' + encodeURIComponent(meRow ? 'me' : p.id), lastActive: r ? r.lastActive : nowIso() };
  }
  function directory() {
    var out = [], seenMe = false;
    (DATA.ROSTER || []).forEach(function (r) {
      if (r.status === 'left') return;
      var p = rosterPerson(r);
      if (p.staff) return;
      if (p.me) { if (seenMe) return; seenMe = true; }
      out.push(dirRow(p, r));
    });
    if (!seenMe) out.push(dirRow(person('me'), null));
    return out;
  }
  function members(opt) {
    opt = opt || {};
    var q = normText(str(opt.q)), lv = opt.lv ? +opt.lv : 0, ck = str(opt.cohort);
    var list = directory().filter(function (m) {
      if (opt.pref && m.pref !== opt.pref) return false;
      if (ck && m.cohortKey !== ck && m.cohort !== ck) return false;
      if (opt.faculty && m.faculty !== opt.faculty) return false;
      if (lv && m.lv !== lv) return false;
      if (q && normText(m.name + ' ' + m.job + ' ' + m.area).indexOf(q) < 0) return false;
      return true;
    });
    var sort = opt.sort || 'new';
    list.sort(function (a, b) {
      if (sort === 'lv') return b.lv - a.lv || new Date(b.joinedAt) - new Date(a.joinedAt);
      if (sort === 'active') return new Date(b.lastActive) - new Date(a.lastActive);
      return new Date(b.joinedAt) - new Date(a.joinedAt);
    });
    return list;
  }
  function membersFacets() {
    var d = directory(), pc = {}, cc = {}, fc = {}, lc = {};
    d.forEach(function (m) {
      if (m.pref) pc[m.pref] = (pc[m.pref] || 0) + 1;
      if (!cc[m.cohortKey]) cc[m.cohortKey] = { value: m.cohortKey, label: m.cohort, count: 0 };
      cc[m.cohortKey].count++;
      fc[m.faculty] = (fc[m.faculty] || 0) + 1;
      lc[m.lv] = (lc[m.lv] || 0) + 1;
    });
    return {
      prefs: keys(pc).map(function (k) { return { value: k, count: pc[k] }; }).sort(function (a, b) { return b.count - a.count; }),
      cohorts: keys(cc).sort().reverse().map(function (k) { return cc[k]; }),
      faculties: DATA.FACULTIES.map(function (f) { return { value: f.id, label: f.name, count: fc[f.id] || 0 }; }),
      lvs: DATA.LEVELS.map(function (l) { return { value: l.lv, label: 'Lv' + l.lv + '「' + l.name + '」', count: lc[l.lv] || 0 }; })
    };
  }
  function memberProfile(id) {
    if (!id) return null;
    var s = S(), pid = null, r = DATA.ROSTER_INDEX && DATA.ROSTER_INDEX[id];
    if (isMe(id)) pid = 'me';
    else if (r) {
      if (r.status === 'left') return null;
      if (r.person === 'demo') pid = s.kind === 'demo' ? 'me' : null;
      else if (r.person) pid = isMe(r.person) ? 'me' : r.person;
    } else if (DATA.PEOPLE[id]) {
      var pr = DATA.PEOPLE[id].no && DATA.ROSTER_INDEX[DATA.PEOPLE[id].no];
      if (pr && pr.status === 'left') return null;
      pid = id;
    } else return null;
    var p = pid ? person(pid) : rosterPerson(r);
    if (!p) return null;
    var key = pid || p.id;
    var posts = feed().filter(function (x) { return pid === 'me' ? x.mine : x.by === key; });
    var intro = posts.filter(function (x) { return x.kind === 'intro'; }).pop() || null;
    var P = pid && pid !== 'me' ? DATA.PEOPLE[pid] : null;
    var rr = r || (P && P.no && DATA.ROSTER_INDEX[P.no]) || null;
    var joined = pid === 'me' ? s.me.joinedAt : rr ? rr.joinedAt : P && P.joinedDaysAgo != null ? DATA.D(-P.joinedDaysAgo) : null;
    var goal = pid === 'me' ? (s.me.goal || '') : '';
    if (!goal && intro) { var g = /やりたいこと[：:]\s*(.+)/.exec(intro.text); if (g) goal = g[1].trim(); }
    var lv = pid === 'me' ? level().lv : p.lv || (rr && rr.level) || 1;
    var gigsOpen = DATA.GIGS.filter(function (g) { return g.by === key && g.type === 'peer' && g.status === 'open'; });
    if (pid === 'me') gigsOpen = myGigs().filter(function (g) { return g.status === 'open'; });
    return {
      id: pid === 'me' ? 'me' : key, no: p.no || (rr && rr.no) || '', name: p.name, me: pid === 'me', staff: !!p.staff, role: p.role || '',
      color: p.color, photo: p.photo || '', cohort: joined ? cohort(joined) : '', joinedAt: joined, lv: p.staff ? null : lv, lvName: p.staff ? '' : levelName(lv),
      area: p.area || '', job: p.job || (rr && rr.job) || '', goal: goal, bio: (P && P.bio) || '',
      intro: intro, posts: posts.filter(function (x) { return x !== intro; }).slice(0, 5),
      hostedEvents: upcoming().filter(function (e) { return e.host === key; }), gigs: gigsOpen,
      completed: p.staff ? 0 : completedCount(pid === 'me' ? 'me' : (P ? key : (rr && rr.no))),
      href: '#/members/' + encodeURIComponent(pid === 'me' ? 'me' : key)
    };
  }

  /* ---------- 検索 ---------- */
  function snippet(text, idx, len) {
    text = String(text || '').replace(/[\r\n\t]/g, ' ');   // 1文字を1文字に置きかえる（位置がずれないように）
    if (idx < 0) { var t = text.slice(0, 60); return { text: t + (text.length > 60 ? '…' : ''), mark: null }; }
    var start = Math.max(0, idx - 20), end = Math.min(text.length, idx + len + 50);
    var pre = start > 0 ? '…' : '', post2 = end < text.length ? '…' : '';
    var off = pre.length + idx - start;
    return { text: pre + text.slice(start, end) + post2, mark: [off, off + len] };
  }
  function matchItem(fields, terms) {
    var all = normText(fields.join('\n'));
    for (var i = 0; i < terms.length; i++) if (all.indexOf(terms[i]) < 0) return null;
    var tn = normText(fields[0]), tm = null;
    terms.some(function (t) { var k = tn.indexOf(t); if (k >= 0) { tm = [k, k + t.length]; return true; } return false; });
    var snip = null;
    for (var f = 1; f < fields.length && !snip; f++) {
      var fn = normText(fields[f]);
      terms.some(function (t) { var k = fn.indexOf(t); if (k >= 0) { snip = snippet(fields[f], k, t.length); return true; } return false; });
    }
    if (!snip) snip = snippet(fields[1] || '', -1, 0);
    return { titleMark: tm, snippet: snip.text, mark: snip.mark, score: (tm ? 10 : 0) + (snip.mark ? 1 : 0) };
  }
  function search(q) {
    var raw = str(q);
    // 検索する言葉は丸ごと NFKC にしてから（半角カナの濁点「ﾀﾞ」を「ダ」にするため）
    var terms = normText(raw.normalize ? raw.normalize('NFKC') : raw).split(/\s+/).filter(Boolean);
    if (!terms.length) return { q: raw, total: 0, groups: [] };
    var G = { courses: [], lessons: [], archive: [], gigs: [], events: [], posts: [], help: [] };
    function hit(group, o, fields) { var m = matchItem(fields, terms); if (m) G[group].push(Object.assign(o, m)); }
    DATA.COURSES.forEach(function (c) {
      var st = courseState(c);
      hit('courses', { type: 'course', id: c.id, title: c.title, sub: 'Lv' + c.level + '・全' + c.lessons.length + '回', href: '#/courses/' + c.id, locked: st.locked },
        [c.title, c.summary || '', (c.learn || []).join(' ')]);
      c.lessons.forEach(function (l, i) {
        hit('lessons', { type: 'lesson', id: l.id, title: l.title, sub: c.title + '・第' + (i + 1) + '回・' + l.min + '分',
          href: '#/lesson/' + c.id + '/' + l.id, locked: lessonState(c, l.id) === 'locked' },
          [l.title, l.desc || '', (l.points || []).join(' '), c.title]);
      });
    });
    DATA.ARCHIVE.forEach(function (a) {
      hit('archive', { type: 'archive', id: a.id, title: a.title, sub: (a.genre || '') + '・' + a.min + '分', href: '#/courses/archive/' + a.id, at: a.date },
        [a.title, a.desc || '', (a.chapters || []).map(function (x) { return x[1]; }).join(' '), (a.files || []).map(function (x) { return x.name; }).join(' ')]);
    });
    var TYPE = {}; DATA.GIG_TYPES.forEach(function (t) { TYPE[t.id] = t.name; });
    DATA.GIGS.filter(function (g) { return g.status === 'open'; }).forEach(function (g) {
      hit('gigs', { type: 'gig', id: g.id, title: g.title, sub: (TYPE[g.type] || '') + '・' + g.reward + '（目安）', href: '#/gigs/' + g.id, at: g.postedAt },
        [g.title, g.desc || '', g.reward || '', TYPE[g.type] || '', g.remote === false ? g.place || '' : '']);
    });
    upcoming().forEach(function (e) {
      hit('events', { type: 'event', id: e.id, title: e.title, sub: mdw(e.at) + ' ' + hm(e.at) + '・' + e.place, href: '#/events/' + e.id, at: e.at },
        [e.title, e.desc || '', e.place || '']);
    });
    feed().forEach(function (p) {
      var who = person(p.by);
      hit('posts', { type: 'post', id: p.id, title: who.name, sub: '', href: '#/feed/' + p.id, at: p.at }, [who.name, p.text]);
    });
    (DATA.HELP || []).forEach(function (h) {
      hit('help', { type: 'help', id: h.id, title: h.q, sub: h.cat, href: '#/help?focus=' + h.id }, [h.q, h.a]);
    });
    var LABEL = [['courses', '講座'], ['lessons', '講座の回'], ['archive', '勉強会の録画'], ['gigs', '案件'], ['events', 'イベント'], ['posts', '投稿'], ['help', 'ヘルプ']];
    var total = 0, groups = [];
    LABEL.forEach(function (x) {
      var items = G[x[0]];
      if (!items.length) return;
      items.sort(function (a, b) { return b.score - a.score || (b.at && a.at ? new Date(b.at) - new Date(a.at) : 0); });
      total += items.length;
      groups.push({ key: x[0], label: x[1], total: items.length, items: items.slice(0, 20) });
    });
    return { q: raw, total: total, groups: groups };
  }

  /* ---------- 案件 ---------- */
  function gig(id) {
    return byId(DATA.GIGS, id) || byId(DATA.GIGS_CLOSED, id) || byId(S().myGigs, id) ||
      // 運営が非公開にした案件でも、応募した人の記録（応募した案件・履歴）からは引ける
      (id && S().gigs[id] && CLG.store.cmsBase ? byId(CLG.store.cmsBase('gig'), id) : null);
  }
  /** 応募できるか。レベルと、必要な講座の修了で決まる */
  function gigLock(g) {
    if (typeof g === 'string') g = gig(g);
    if (!g) return { locked: true, reason: '募集が見つかりません' };
    var lv = level().lv;
    if (g.level > lv) return { locked: true, reason: 'Lv' + g.level + 'から応募できます' };
    if (g.requires && course(g.requires) && !certified(g.requires)) return { locked: true, reason: '講座「' + course(g.requires).title + '」の修了で応募できます', course: g.requires };
    return { locked: false };
  }
  /* 状態の名前は1つの表にまとめる（一覧・詳細・運営画面で同じ言葉にする） */
  var GIG_LABELS = { applied: '応募済み', meeting: '面談の調整中', active: '稼働中', done: '完了', referred: '紹介済み', declined: '見送り' };
  var GIG_TAG = { applied: 'applied', meeting: 'meeting', active: 'working', done: 'done', referred: 'applied', declined: 'canceled' };
  /* 'rewarded'（運営が報酬の額を確定した）は、会員から見ると「完了」と同じ */
  function isDoneStatus(st) { return st === 'done' || st === 'rewarded'; }
  function gigKey(x, g) { return x.status === 'applied' && g && g.type === 'refer' ? 'referred' : isDoneStatus(x.status) ? 'done' : x.status; }
  function gigState(id) {
    var x = S().gigs[id], g = gig(id);
    if (!x) return null;
    var k = gigKey(x, g);
    var sub = k === 'applied' ? (g && g.type === 'peer' ? '掲載した会員が確認中' : '運営が確認中') : k === 'referred' ? '担当者が確認中'
      : k === 'meeting' ? '面談の日にちを決めています' : k === 'declined' ? '今回は見送りになりました' : '';
    return Object.assign({ key: k, label: GIG_LABELS[k] || '', tag: GIG_TAG[k] || 'applied', sub: sub }, x);
  }
  /** 応募の窓に出す1文（プライバシーポリシー 3-2：相手に何が伝わるか） */
  function gigDisclosure(id) {
    var g = gig(id);
    if (!g) return '';
    if (g.type === 'refer') return '入力した紹介先の情報を担当者に伝えます';
    if (g.type === 'peer') return '応募すると、お名前と連絡先を掲載者にお伝えします';
    return '応募すると、お名前と連絡先を運営と依頼先にお伝えします';
  }
  function gigClosed(g) { return g.status === 'closed' || (g.closesAt && new Date(g.closesAt) < now()); }
  function applyGig(id, note) {
    var g = gig(id);
    if (!g || gigLock(g).locked || S().gigs[id] || gigClosed(g) || g.by === 'me') return null;
    update(function (s) {
      s.gigs[id] = { status: 'applied', at: nowIso(), note: str(note) };
      slot(s, 'gigHistory', {})[id] = [{ at: nowIso(), text: g.type === 'refer' ? '紹介先を伝えました' : '応募しました' }];
    });
    return Object.assign(syncSteps() || { xp: 0 }, { disclosure: gigDisclosure(id) });
  }
  function withdrawGig(id) {
    update(function (s) {
      if (s.gigs[id] && s.gigs[id].status === 'applied') { delete s.gigs[id]; if (s.gigHistory) delete s.gigHistory[id]; }
    });
  }
  /** 案件で得た報酬（完了して額が決まったもの）の合計。稼働中の案件の報酬（見込み）は入れない */
  function gigEarnings() {
    var s = S();
    return keys(s.gigs).reduce(function (a, k) { var x = s.gigs[k]; return a + (x && isDoneStatus(x.status) ? (x.reward || 0) : 0); }, 0);
  }
  /** 土日なら次の月曜に（祝日は見ない。紹介報酬の支払日と同じ決まり） */
  function bizDay(d) {
    d = new Date(d);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d;
  }
  /** 案件の報酬の、月 m（0始まり。年をまたいでよい）の支払日＝月末（土日は翌営業日） */
  function gigPayIn(y, m) { return bizDay(new Date(y, m + 1, 0, 10, 0)); }
  /** 報酬の支払日。案件の手順の書き方（当月末・翌月末）から決める */
  function gigPayDate(g, doneAt) {
    var d = new Date(doneAt), txt = ((g && g.steps) || []).join(' ');
    return gigPayIn(d.getFullYear(), d.getMonth() + (/当月末/.test(txt) ? 0 : 1));
  }
  /* 振込先があるときだけ払う。nth(k) は k 回目の支払日（0＝本来の日。1＝次の月の支払日…）。
     振込先がない → 払わずに、いまより後の次の支払日へ繰り越す。
     振込先を支払日のあとで登録した → 登録したあとの最初の支払日に払う。
     → null（まだ支払日の前）／{ paid:true, at }／{ paid:false, at（繰り越した先の支払日）, carried:true, bank（振込先があるか） } */
  function bankSince() { var b = S().bank; return b ? (valid(b.at) ? new Date(b.at) : new Date(0)) : null; }
  function settle(nth, n) {
    var d = nth(0);
    if (n < d) return null;
    var since = bankSince(), k = 0;
    if (since) {
      while (d < since && k < 60) d = nth(++k);
      if (n >= d) return { paid: true, at: d };
    } else while (d <= n && k < 60) d = nth(++k);
    return { paid: false, at: d, carried: true, bank: !!since };
  }
  var CARRY_NOTE = { none: '振込先が未登録のため、次の支払日に繰り越し', late: '振込先を登録したあとの支払日に振込' };
  /** 報酬（完了して額が決まった案件だけ）。額がまだ決まっていない完了の案件は null。
      振込先がないまま支払日が過ぎたら、払ったことにはせず（確定のまま）次の月末へ繰り越す（carried・note） */
  function gigReward(id) {
    var x = S().gigs[id], g = gig(id);
    if (!x || !isDoneStatus(x.status) || !(x.reward > 0)) return null;
    var out = { amount: x.reward || 0, needBank: !S().bank };
    if (valid(x.paidAt)) return Object.assign(out, { status: 'paid', label: '支払済', payAt: new Date(x.paidAt).toISOString(), paidAt: new Date(x.paidAt).toISOString() });
    var d = new Date(x.rewardedAt || x.doneAt || x.at), txt = ((g && g.steps) || []).join(' '), k0 = /当月末/.test(txt) ? 0 : 1;
    var nth = function (k) { return gigPayIn(d.getFullYear(), d.getMonth() + k0 + k); };
    var st = settle(nth, now()), payAt = st ? st.at : nth(0);
    if (st && st.paid) return Object.assign(out, { status: 'paid', label: '支払済', payAt: payAt.toISOString(), paidAt: payAt.toISOString() });
    return Object.assign(out, { status: 'confirmed', label: '確定', payAt: payAt.toISOString(),
      carried: !!st, note: st ? CARRY_NOTE[st.bank ? 'late' : 'none'] : '' });
  }
  function gigHistory(id) {
    var s = S(), g = gig(id), x = s.gigs[id];
    var list = ((s.gigHistory || {})[id] || []).filter(function (h) { return isPast(h.at); })
      .map(function (h) { return { at: h.at, text: h.text, done: true }; });
    function has(re) { return list.some(function (h) { return re.test(h.text); }); }
    if (x && g) {
      var refer = g.type === 'refer';
      // 記録のない古い案件（募集を終えた案件など）も、応募と完了の行はそろえる
      if (x.at && isPast(x.at) && !has(/応募|紹介先を伝え/)) list.push({ at: x.at, text: refer ? '紹介先を伝えました' : '応募しました', done: true });
      if (isDoneStatus(x.status) && (x.doneAt || x.at) && !has(/完了|成約/)) list.push({ at: x.doneAt || x.at, text: refer ? '成約しました' : '完了しました', done: true });
      list.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
      if (x.status === 'applied') {
        // 会員どうしの募集は、運営ではなく掲載した会員が決める
        list.push({ at: null, text: refer ? '担当者から連絡' : g.type === 'peer' ? '掲載した会員から返事' : '運営から連絡（面談の候補）', done: false });
      }
      if (x.status === 'meeting') list.push({ at: x.meetingAt || null, text: '面談', done: false });
      if (x.status === 'active') {
        var e = new Date(now().getFullYear(), now().getMonth() + 1, 0, 23, 59), month = (e.getMonth() + 1) + '月分';
        // 今月の作業報告を出したあとは、予定の行を出さない
        var sent = (s.workReports || []).some(function (r) { return r.gig === id && r.month === month; });
        if (!sent) list.push({ at: e.toISOString(), text: month + 'の作業報告', done: false });
      }
      if (isDoneStatus(x.status)) {
        var rw = gigReward(id);
        if (rw) {
          list.push({ at: x.rewardedAt || x.doneAt || x.at, text: '報酬確定（' + Number(rw.amount).toLocaleString('ja-JP') + '円）', done: true });
          list.push({ at: rw.payAt, text: rw.status === 'paid' ? 'お支払い済み' : '支払予定日' + (rw.needBank ? '（振込先の登録が必要です）' : ''), done: rw.status === 'paid' });
        } else list.push({ at: null, text: '報酬の確定', done: false });
      }
    } else list.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    return list;
  }
  /* 掲載できないもの（投資・FX・ローン・高額なノウハウの販売・収入の保証・勧誘）。README の法律まわりの約束と同じ。
     「商\u6750」は、画面の言葉から外した語をソースに残さないための書き方（入力された文には当たる） */
  var BANNED = [
    ['投資・FX', /投資|株式の売買|仮想通貨|暗号資産|ビットコイン|FX|為替取引|バイナリー|自動売買|先物/i],
    ['ローン・借入', /ローン|借入|借り入れ|キャッシング|融資|貸金/],
    ['ノウハウの販売', /情報商\u6750|高額塾|稼げるノウハウ|教材を販売|自己アフィリ/],
    ['収入の保証', /必ず稼|確実に稼|誰でも稼|簡単に稼|不労所得|放置で稼|元本保証|絶対に(儲|稼)|月\s*[0-9０-９一二三四五六七八九十]+\s*万円?\s*(以上)?\s*(を)?\s*(稼|の収入|の副収入|保証|可能)/],
    ['勧誘', /マルチ|ネットワークビジネス|MLM|権利収入|紹介するだけで/i]
  ];
  function checkBanned(text) { text = String(text || ''); return BANNED.filter(function (b) { return b[1].test(text); }).map(function (b) { return b[0]; }); }
  function parseDay(v) {
    if (!v) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 0, 0) : new Date(v);
    return isNaN(d) ? null : d;
  }
  function gigFormErrors(f) {
    var e = {}, title = str(f.title), desc = str(f.desc), reward = str(f.reward);
    if (!title) e.title = '題を入れてください'; else if (title.length > 40) e.title = '40文字までにしてください';
    if (!desc) e.desc = '内容を入れてください'; else if (desc.length > 1000) e.desc = '1000文字までにしてください';
    if (!reward) e.reward = '報酬の目安を入れてください';
    if (!str(f.payment)) e.payment = '支払いの時期と方法を入れてください';
    var remote = f.remote === true || f.remote === 'true' || f.remote === 'remote' || f.remote === '1';
    if (!remote && !str(f.place)) e.place = '場所を入れてください（市区町村まで）';
    if (!str(f.time)) e.time = '期間か時間の目安を入れてください';
    var slots = parseInt(halfWidth(f.slots), 10);
    if (!(slots >= 1 && slots <= 20)) e.slots = '人数は1〜20で入れてください';
    var lv = parseInt(f.level, 10);
    if (f.level != null && f.level !== '' && !(lv >= 1 && lv <= 6)) e.level = 'レベルを選んでください';
    var close = parseDay(f.closesAt);
    if (!close) e.closesAt = '締切の日を選んでください';
    else if (close <= now()) e.closesAt = '締切は明日以降の日にしてください';
    else if ((close - now()) / DAY > 60) e.closesAt = '締切は60日以内にしてください';
    [['title', title], ['desc', desc], ['reward', reward]].forEach(function (x) {
      var hit = checkBanned(x[1]);
      if (hit.length && !e[x[0]]) e[x[0]] = 'この内容は掲載できません（' + hit.join('・') + '）';
    });
    if (!f.agree) e.agree = '確認にチェックを入れてください';
    return { e: e, remote: remote, slots: slots, level: lv >= 1 ? lv : 1, close: close };
  }
  /** 掲載前の見直し（確認の窓を出す前）。createGig と同じ確かめで、何も作らない */
  function validateGig(form) {
    var v = gigFormErrors(form || {});
    return { ok: !keys(v.e).length, errors: v.e };
  }
  function createGig(form) {
    form = form || {};
    var v = gigFormErrors(form);
    if (keys(v.e).length) return { ok: false, errors: v.e };
    // 差し戻された募集を直して出し直すときは、同じ id のまま確認に戻す（差し戻しの募集を一覧に残さない）
    var prev = form.from ? myGigRaw(S(), form.from) : null;
    if (prev && prev.status !== 'rejected') prev = null;
    var id = prev ? prev.id : uid('mg'), at = nowIso();
    var g = { id: id, type: 'peer', title: str(form.title), desc: str(form.desc), reward: str(form.reward), payment: str(form.payment),
      rewardType: form.rewardType === 'stock' ? 'stock' : 'shot', level: v.level, time: str(form.time), remote: v.remote, place: v.remote ? '' : str(form.place),
      slots: v.slots + '名', by: 'me', status: 'review', submittedAt: at, postedAt: null, closesAt: v.close.toISOString(), isNew: false,
      applicants: [], rejectReason: '' };
    update(function (s) {
      var list = slot(s, 'myGigs', []), h = slot(s, 'gigHistory', {});
      if (prev) {
        var x = myGigRaw(s, id);
        g.resubmittedAt = at; g.prevRejectReason = x.rejectReason || '';
        list[list.indexOf(x)] = g;
        h[id] = (h[id] || []).concat([{ at: at, text: '直して出し直しました（運営の確認中）' }]);
      } else {
        list.push(g);
        h[id] = [{ at: at, text: '掲載を申し込みました（運営の確認中）' }];
      }
    });
    return { ok: true, gig: g, resubmitted: !!prev };
  }
  /** 自分の募集を直す。差し戻し → 同じ id のまま直して確認に出し直す（createGig の from と同じ）。
      確認中 → その場で直す（確認中のまま）。掲載中・終了は直せない（掲載を終えて新しく出す） */
  function editGig(id, form) {
    var g0 = myGigRaw(S(), id);
    if (!g0) return { ok: false, error: '募集が見つかりません' };
    if (g0.status === 'rejected') return createGig(Object.assign({}, form || {}, { from: id }));
    if (g0.status !== 'review') {
      return { ok: false, error: g0.status === 'open' ? '掲載中の募集は直せません。掲載を終えてから、新しく出してください' : '終わった募集は直せません' };
    }
    var v = gigFormErrors(form || {});
    if (keys(v.e).length) return { ok: false, errors: v.e };
    var f = form || {}, at = nowIso();
    update(function (s) {
      var x = myGigRaw(s, id), h = slot(s, 'gigHistory', {});
      Object.assign(x, { title: str(f.title), desc: str(f.desc), reward: str(f.reward), payment: str(f.payment),
        rewardType: f.rewardType === 'stock' ? 'stock' : 'shot', level: v.level, time: str(f.time), remote: v.remote, place: v.remote ? '' : str(f.place),
        slots: v.slots + '名', closesAt: v.close.toISOString(), editedAt: at });
      h[id] = (h[id] || []).concat([{ at: at, text: '内容を直しました（運営の確認中）' }]);
    });
    return { ok: true, gig: byId(myGigs(), id), edited: true };
  }
  var MY_GIG_LABELS = { review: '確認中', open: '掲載中', rejected: '差し戻し', closed: '終了' };
  var MY_GIG_TAG = { review: 'review', open: 'active', rejected: 'waitlist', closed: 'closed' };
  function myGigs() {
    return (S().myGigs || []).map(function (g) {
      var st = g.status === 'open' && g.closesAt && new Date(g.closesAt) < now() ? 'closed' : g.status;
      return Object.assign({}, g, { status: st, statusLabel: MY_GIG_LABELS[st] || '', tag: MY_GIG_TAG[st] || 'review',
        applicantCount: (g.applicants || []).length,
        newApplicants: (g.applicants || []).filter(function (a) { return a.status === 'applied'; }).length });
    }).sort(function (a, b) { return new Date(b.postedAt || b.submittedAt) - new Date(a.postedAt || a.submittedAt); });
  }
  function myGigRaw(s, id) { return byId(s.myGigs, id); }
  function closeGig(id) {
    var g = myGigRaw(S(), id);
    if (!g || g.status === 'closed') return null;
    update(function (s) {
      var x = myGigRaw(s, id); x.status = 'closed'; x.closedAt = nowIso();
      slot(s, 'gigHistory', {})[id] = (s.gigHistory[id] || []).concat([{ at: nowIso(), text: '掲載を終えました' }]);
    });
    return byId(myGigs(), id);
  }
  var APPLICANT_LABELS = { applied: '応募', accepted: '採用', declined: '見送り' };
  var APPLICANT_TAG = { applied: 'applied', accepted: 'confirmed', declined: 'canceled' };
  function applicants(id) {
    var g = myGigRaw(S(), id);
    if (!g) return [];
    return (g.applicants || []).map(function (a) {
      return Object.assign({ who: person(a.person), label: APPLICANT_LABELS[a.status] || '', tag: APPLICANT_TAG[a.status] || 'applied' }, a);
    }).sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  function setApplicant(gigId, personId, status) {
    var g = myGigRaw(S(), gigId);
    var a = g && (g.applicants || []).filter(function (x) { return x.person === personId; })[0];
    if (!a || a.status === status) return null;
    var name = person(personId).name;
    update(function (s) {
      var x = myGigRaw(s, gigId), y = x.applicants.filter(function (q) { return q.person === personId; })[0];
      y.status = status; y.decidedAt = nowIso();
      var h = slot(s, 'gigHistory', {});
      h[gigId] = (h[gigId] || []).concat([{ at: nowIso(), text: name + 'さんを' + (status === 'accepted' ? '採用しました' : '見送りました') }]);
      if (status === 'accepted') {
        // 会員どうしの連絡は、運営も見える3者のスレッドで（決定事項：会員どうしのDMは作らない）
        var t = slot(s, 'gigThreads', {});
        if (!t[gigId]) t[gigId] = [];
        t[gigId].push({ from: 'staff2', at: nowIso(), text: name + 'さんの採用を伝えました。ここからは掲載した人・応募した人・運営の3人でやりとりします。日時と場所はここで決めてください。' });
      }
    });
    return { ok: true, status: status, thread: status === 'accepted' ? gigThread(gigId) : null };
  }
  function acceptApplicant(gigId, personId) { return setApplicant(gigId, personId, 'accepted'); }
  function declineApplicant(gigId, personId) { return setApplicant(gigId, personId, 'declined'); }
  /** 試作版：自分が出した募集（掲載中）に、ほかの会員から応募が来たことにする（運営画面・試作版バーの台本用） */
  var APPLICANT_NOTES = ['土曜なら行けます。', '平日の夜なら作業できます。', '近い作業を前職でしていました。', '子どもを預けられる日なら行けます。'];
  function simulateApplicant(gigId, personId, note) {
    var g = myGigRaw(S(), gigId);
    if (!g) return { ok: false, error: '募集が見つかりません' };
    if (g.status !== 'open' || gigClosed(g)) return { ok: false, error: '掲載中の募集ではありません' };
    var pid = personId && DATA.PEOPLE[personId] && !DATA.PEOPLE[personId].staff && !isMe(personId) ? personId : null;
    if (!pid) {
      // 決めていなければ、まだ応募していない会員から選ぶ
      var taken = (g.applicants || []).map(function (a) { return a.person; });
      pid = ['m25', 'm17', 'm16', 'm27', 'm15', 'm2'].filter(function (x) { return DATA.PEOPLE[x] && !isMe(x) && taken.indexOf(x) < 0; })[0];
    }
    if (!pid) return { ok: false, error: '応募できる会員がいません' };
    if ((g.applicants || []).some(function (a) { return a.person === pid; })) return { ok: false, error: 'もう応募しています' };
    var a = { person: pid, at: nowIso(), note: str(note) || APPLICANT_NOTES[(g.applicants || []).length % APPLICANT_NOTES.length], status: 'applied' };
    var name = person(pid).name;
    update(function (s) {
      var x = myGigRaw(s, gigId);
      x.applicants = (x.applicants || []).concat([a]);
      var h = slot(s, 'gigHistory', {});
      h[gigId] = (h[gigId] || []).concat([{ at: a.at, text: name + 'さんから応募がありました' }]);
      addNotice(s, 'gig', '募集「' + x.title + '」に' + name + 'さんから応募がありました', '#/gigs/' + gigId);
    });
    return { ok: true, applicant: Object.assign({ who: person(pid), label: APPLICANT_LABELS.applied, tag: APPLICANT_TAG.applied }, a) };
  }
  /* 運営画面から、応募を1段ずつ進める（A2 の応募の一覧）。会員ページの案件の画面・お知らせ・XP がそろって動く。
     形は2つ：advanceGigApp(gigId, status, opt?)（前からの形）／ advanceGigApp(gigId, personOrMe, status, opt?)。
     personOrMe が会員ページの会員（'me'・自分の会員番号・在籍半年の会員の m8）でなければ、何もせず { ok:true, other:true } を返す
     （ほかの会員の応募は運営画面の記録だけ）。status は applied → meeting → active → done → rewarded と、見送りの declined */
  var APP_ORDER = ['applied', 'meeting', 'active', 'done', 'rewarded'];
  function advanceGigApp(gigId, a, b, c) {
    var status, opt, who = 'me';
    if (typeof a === 'string' && (APP_ORDER.indexOf(a) >= 0 || a === 'declined')) { status = a; opt = b; }
    else { who = a == null || a === '' ? 'me' : String(a); status = b; opt = c; }
    opt = opt || {};
    if (!isMe(who)) return { ok: true, xp: 0, other: true };
    if (status === 'declined') return declineGigApp(gigId, opt.reason);
    var s0 = S(), x0 = s0.gigs[gigId], g = gig(gigId);
    if (!x0 || !g) return { ok: false, error: 'この会員の応募が見つかりません' };
    if (x0.status === 'declined') return { ok: false, error: '見送りにした応募です' };
    var from = APP_ORDER.indexOf(x0.status), to = APP_ORDER.indexOf(status);
    if (to < 0) return { ok: false, error: '進める先が正しくありません' };
    if (to <= from) return { ok: false, error: 'すでに「' + (GIG_LABELS[gigKey({ status: x0.status }, g)] || x0.status) + '」まで進んでいます' };
    var amount = opt.reward != null ? parseInt(String(opt.reward).replace(/[^\d]/g, ''), 10) : null;
    if (status === 'rewarded' && !(amount >= 1)) return { ok: false, error: '報酬の額を入れてください' };
    var refer = g.type === 'refer', at = nowIso();
    var TEXT = {
      meeting: refer ? '担当者に引き継ぎました' : '運営から面談の連絡がありました',
      active: refer ? '担当者と紹介先が話を進めています' : '稼働を始めました',
      done: refer ? '成約しました' : '完了しました'
    };
    var r = update(function (s) {
      var x = s.gigs[gigId], h = slot(s, 'gigHistory', {}), out = { ok: true, xp: 0 };
      function hist(t) { h[gigId] = (h[gigId] || []).concat([{ at: at, text: t }]); }
      // 1段飛ばしたときも、途中の段の日付をそろえる（面談 → 稼働 → 完了）
      for (var i = Math.max(from + 1, 1); i <= to; i++) {
        var st = APP_ORDER[i];
        if (st === 'meeting') { x.meetingOfferedAt = x.meetingOfferedAt || at; hist(TEXT.meeting); }
        if (st === 'active') { x.startedAt = x.startedAt || at; hist(TEXT.active); }
        if (st === 'done') {
          x.doneAt = x.doneAt || at; hist(TEXT.done);
          out = addXp(s, DATA.XP.gigDone, '案件「' + g.title + '」が完了', '#/gigs/' + gigId);
          out.ok = true;
        }
      }
      x.status = status;
      if (status === 'rewarded') { x.reward = amount; x.rewardedAt = at; }
      var tail = { meeting: refer ? 'を担当者に引き継ぎました' : 'は、面談の日にちを決めるところまで進みました',
        active: refer ? 'の話が進んでいます' : 'の稼働が始まりました', done: refer ? 'が成約しました' : 'が完了しました',
        rewarded: 'の報酬（' + Number(amount || 0).toLocaleString('ja-JP') + '円）が確定しました' }[status];
      addNotice(s, status === 'rewarded' ? 'reward_confirmed' : 'gig', '案件「' + g.title + '」' + tail, '#/gigs/' + gigId);
      return out;
    });
    return merge(r, syncSteps()) || r;
  }
  /** 見送り（応募中・面談の調整中の応募だけ）。会員の案件の画面は「見送り」になり、お知らせが届く */
  function declineGigApp(gigId, reason) {
    var x0 = S().gigs[gigId], g = gig(gigId);
    if (!x0 || !g) return { ok: false, error: 'この会員の応募が見つかりません' };
    if (x0.status !== 'applied' && x0.status !== 'meeting') return { ok: false, error: '応募中か面談の調整中の応募だけ見送りにできます' };
    update(function (s) {
      var x = s.gigs[gigId], h = slot(s, 'gigHistory', {}), at = nowIso();
      x.status = 'declined'; x.declinedAt = at; x.declineReason = str(reason);
      h[gigId] = (h[gigId] || []).concat([{ at: at, text: '今回は見送りになりました' }]);
      addNotice(s, 'gig', '案件「' + g.title + '」は、今回は見送りになりました', '#/gigs/' + gigId);
    });
    return { ok: true, xp: 0, status: 'declined' };
  }
  function submitWorkReport(id, form) {
    form = form || {};
    var x = S().gigs[id];
    if (!x || x.status !== 'active') return { ok: false, error: '稼働中の案件だけ報告できます' };
    var url = str(form.url), memo = str(form.memo), fileName = str(form.fileName), e = {};
    if (!url && !fileName) e.url = 'URLかファイルのどちらかを付けてください';
    if (url && !/^https?:\/\/[^\s/]+\.[^\s]+$/.test(url)) e.url = 'URLは https:// から入れてください';
    if (memo.length > 1000) e.memo = '1000文字までにしてください';
    if (keys(e).length) return { ok: false, errors: e };
    var month = (now().getMonth() + 1) + '月分';
    var rep = { id: uid('wr'), gig: id, at: nowIso(), month: month, url: url, fileName: fileName, memo: memo, status: '確認中' };
    update(function (s) {
      slot(s, 'workReports', []).push(rep);
      var h = slot(s, 'gigHistory', {});
      h[id] = (h[id] || []).concat([{ at: rep.at, text: month + 'の作業報告を出しました' }]);
    });
    return { ok: true, report: rep };
  }
  function workReports(id) {
    return (S().workReports || []).filter(function (r) { return !id || r.gig === id; })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  /** 案件のスレッド。見られるのは掲載した人・応募した人・運営だけ */
  function gigThread(id) {
    var s = S(), g = gig(id);
    if (!g) return null;
    var poster = g.by === 'me' || isMe(g.by), x = s.gigs[id];
    if (!poster && !x) return null;
    var accepted = poster ? (g.applicants || []).filter(function (a) { return a.status === 'accepted'; }) : [];
    var parts = [person(g.by)];
    if (poster) accepted.forEach(function (a) { parts.push(person(a.person)); }); else parts.push(person('me'));
    if (!parts.some(function (p) { return p.id === 'staff2'; })) parts.push(person('staff2'));
    var msgs = ((s.gigThreads || {})[id] || []).filter(function (m) { return isPast(m.at); })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); })
      .map(function (m) { return Object.assign({ who: person(m.from), mine: isMe(m.from) }, m); });
    var canSend = poster ? accepted.length > 0 : !!(x && x.status !== 'applied') || msgs.length > 0;
    return { gig: id, participants: parts, messages: msgs, canSend: canSend };
  }
  function sendGigMessage(id, text) {
    text = str(text);
    var t = gigThread(id);
    if (!t) return { ok: false, error: 'このスレッドには書けません' };
    if (!text) return { ok: false, error: 'メッセージを入れてください' };
    if (text.length > 1000) return { ok: false, error: '1000文字までにしてください' };
    var m = { from: 'me', at: nowIso(), text: text };
    update(function (s) { var th = slot(s, 'gigThreads', {}); (th[id] = th[id] || []).push(m); });
    return { ok: true, message: m };
  }

  /* ---------- 振込先（案件の報酬と紹介報酬で同じ口座） ---------- */
  function toKatakana(t) { return String(t || '').replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); }); }
  function bankName(n) { n = str(n); return !n || /(銀行|信用金庫|信金|信用組合|労働金庫|農業協同組合|JA|ゆうちょ|バンク|銀)$/.test(n) ? n : n + '銀行'; }
  function branchName(n) { n = str(n); return !n || /(支店|出張所|営業部|本店|支所|店)$/.test(n) ? n : n + '支店'; }
  function validateBank(form) {
    form = form || {}; var e = {};
    var bank = str(form.bank), branch = str(form.branch), kind = str(form.kind);
    var number = halfWidth(form.number).replace(/[\s-]/g, '');
    var h0 = String(form.holder == null ? '' : form.holder);
    var holder = toKatakana(h0.normalize ? h0.normalize('NFKC') : halfWidth(h0)).replace(/\s+/g, ' ').trim();
    var inv = halfWidth(form.invoiceNo).replace(/[\s-]/g, '').toUpperCase();
    if (!bank) e.bank = '銀行名を入れてください';
    if (!branch) e.branch = '支店名を入れてください';
    if (kind !== '普通' && kind !== '当座') e.kind = '普通か当座を選んでください';
    if (!number) e.number = '口座番号を入れてください';
    else if (!/^\d+$/.test(number)) e.number = '口座番号は数字だけで入れてください';
    else if (number.length !== 7) e.number = '口座番号は7桁です（6桁以下なら頭に0を付けてください）';
    if (!holder) e.holder = '口座名義を入れてください';
    else if (!/^[ァ-ー ()（）．.\-－／/]+$/.test(holder)) e.holder = '口座名義はカタカナで入れてください（例：ヤマダ ハナコ）';
    if (inv && !/^T\d{13}$/.test(inv)) e.invoiceNo = '登録番号は「T」と13桁の数字です（例：T1234567890123）';
    return { ok: !keys(e).length, errors: e,
      value: { bank: bankName(bank), branch: branchName(branch), kind: kind, tail: number.slice(-4), holder: holder, invoiceNo: inv } };
  }
  function maskBank(b) {
    if (!b) return null;
    var num = '***' + b.tail;
    return Object.assign({}, b, { number: num, masked: [b.bank, b.branch, b.kind, num, b.holder].filter(Boolean).join(' ') });
  }
  function setBank(form) {
    var v = validateBank(form);
    if (!v.ok) return { ok: false, errors: v.errors };
    // 口座番号は下4桁だけ残す（全部は本番の決済・振込の側で持つ）
    update(function (s) { s.bank = Object.assign({ at: nowIso() }, v.value); });
    return { ok: true, bank: bank() };
  }
  function bank() { return maskBank(S().bank); }
  /** 振込先を消す。それまでに払った報酬は払ったまま（振込先がないと支払済にしない決まりなので、先に記録に残す） */
  function removeBank() {
    var paidRows = rewardRows().filter(function (r) { return r.status === 'paid'; });
    var paidGigs = keys(S().gigs).map(function (id) { return [id, gigReward(id)]; }).filter(function (x) { return x[1] && x[1].status === 'paid'; });
    update(function (s) {
      var st = slot(s, 'rewardStatus', {});
      paidRows.forEach(function (r) { if (!st[r.id] || st[r.id].status !== 'paid') st[r.id] = { status: 'paid', at: r.paidAt || r.payAt }; });
      paidGigs.forEach(function (x) { if (s.gigs[x[0]] && !s.gigs[x[0]].paidAt) s.gigs[x[0]].paidAt = x[1].paidAt || x[1].payAt; });
      s.bank = null;
    });
    return true;
  }

  /* ---------- イベント ---------- */
  /** 運営が載せた自分の企画（state.proposals の approved）。イベントと同じ形にする（events.js の一覧・詳細と同じ形） */
  function memberEvents() {
    return (S().proposals || []).filter(function (p) { return p.kind === 'event' && p.status === 'approved' && valid(p.at); }).map(function (p) {
      return { id: p.id, own: true, kind: p.online ? 'online' : 'offline', title: p.title, at: p.at, min: 0,
        place: p.place, cap: p.cap, count: 0, fee: p.fee, host: 'me', desc: p.desc };
    });
  }
  function allEvents() { return DATA.EVENTS.concat(memberEvents()); }
  function event(id) { return byId(DATA.EVENTS, id) || (id ? byId(memberEvents(), id) : null); }
  function isReserved(id) { return !!S().events[id]; }
  function isFull(e) { if (typeof e === 'string') e = event(e); return !!e && e.count >= e.cap; }
  function attended(id) { return S().attended.some(function (a) { return a.id === id; }); }
  /** 対象を決めた会（入会30日以内の方向け）に、この人が入れるか */
  function audienceOk(e) { return !e.audience || (e.audience === 'new30' && day() <= 30); }
  /** 新入生オリエンテーションに一度出たか（出た人には次の回を並べない） */
  function sawOrientation() {
    return S().attended.some(function (a) {
      var e = byId(DATA.EVENTS, a.id);
      return (e && e.series === 'orientation') || /オリエンテーション/.test(a.title || '');
    });
  }
  /** 一覧に並べてよいか：対象外（入会30日を過ぎた・オリエンテーションに出た）でも、予約していれば出す */
  function listed(e) {
    if (isReserved(e.id)) return true;
    if (!audienceOk(e)) return false;
    return !(e.audience === 'new30' && sawOrientation());
  }
  /** 対象の会（新入生オリエンテーション）に、もう一度出ようとしていないか。予約済みの回はそのまま */
  function againNew30(e) { return e.audience === 'new30' && sawOrientation() && !isReserved(e.id); }
  function eventOpen(e) {
    if (typeof e === 'string') e = event(e);
    return !!e && !e.own && !attended(e.id) && new Date(e.at) > now() && audienceOk(e) && !againNew30(e) && !isFull(e);
  }
  /** 予約する。満席・対象外（オリエンテーションに出た人の次の回も）・自分の企画なら null。キャンセル待ちからは外れる */
  function reserve(id) {
    var e = event(id);
    if (!e || e.own || isFull(e) || attended(id) || !audienceOk(e) || againNew30(e)) return null;
    update(function (s) { s.events[id] = nowIso(); if (s.waitlist) delete s.waitlist[id]; });
    return { xp: 0 };
  }
  function unreserve(id) { update(function (s) { delete s.events[id]; }); }
  function upcoming() {
    var n = now();
    return allEvents().filter(function (e) { return new Date(e.at) > n && !attended(e.id) && listed(e); })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  }
  function myUpcoming() { return upcoming().filter(function (e) { return isReserved(e.id); }); }
  /** 予約していて終わった会のうち、出欠がまだ付いていないもの（「参加した」に入る前。運営が出欠を付けると消える）。新しい順 */
  function pastReserved() {
    var n = now();
    return allEvents().filter(function (e) {
      return isReserved(e.id) && !attended(e.id) && new Date(new Date(e.at).getTime() + (e.min || 60) * MIN) <= n;
    }).sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  /** 試作版だけ：予約中のイベントに「参加したことにする」（本番は出欠を運営が付ける：markAttendance） */
  function attend(id) {
    var e = event(id);
    if (!e || attended(id)) return null;
    var r = update(function (s) {
      s.attended.push({ id: id, title: e.title, at: e.at, kind: e.kind });
      delete s.events[id];
      return addXp(s, DATA.XP.event, 'イベント「' + e.title + '」に参加', e.archive ? '#/courses/archive/' + e.archive : '#/events/' + id);
    });
    return merge(r, syncSteps());
  }
  /* キャンセル待ち：前に並んでいる人数はデータの waiting（なければ1人） */
  function waitlistPos(id) {
    var w = (S().waitlist || {})[id];
    if (!w) return 0;
    var e = event(id);
    return (e && e.waiting != null ? e.waiting : 1) + 1;
  }
  function joinWaitlist(id) {
    var e = event(id);
    if (!e || !isFull(e) || isReserved(id) || attended(id) || new Date(e.at) <= now()) return { ok: false, error: 'キャンセル待ちできません' };
    if (!(S().waitlist || {})[id]) update(function (s) { slot(s, 'waitlist', {})[id] = nowIso(); });
    return { ok: true, position: waitlistPos(id) };
  }
  function leaveWaitlist(id) { update(function (s) { if (s.waitlist) delete s.waitlist[id]; }); return true; }
  /** 運営画面から：キャンセル待ちから予約に繰り上げる（運営が定員を増やしたときなので、満席でも予約にする）。
      who が会員ページの会員でなければ、何もせず { ok:true, other:true }（ほかの会員は運営画面の記録だけ） */
  function promoteWaitlist(id, who) {
    if (who != null && who !== '' && !isMe(who)) return { ok: true, other: true };
    var e = event(id);
    if (!e) return { ok: false, error: 'イベントが見つかりません' };
    if (!(S().waitlist || {})[id]) return { ok: false, error: 'この会員はキャンセル待ちに入っていません' };
    if (new Date(e.at) <= now()) return { ok: false, error: '終わったイベントです' };
    update(function (s) {
      s.events[id] = nowIso();
      delete s.waitlist[id];
      addNotice(s, 'event_before', 'キャンセル待ちから予約に繰り上がりました：「' + e.title + '」' + mdw(e.at) + ' ' + hm(e.at) + 'から', '#/events/' + id);
    });
    return { ok: true, reserved: true };
  }
  /** 参加のしかた。Zoom は開始30分前から、会場の住所は予約した人だけ */
  function eventAccess(id) {
    var e = event(id);
    if (!e) return null;
    var n = now(), start = new Date(e.at), end = new Date(start.getTime() + (e.min || 60) * MIN);
    var opens = new Date(start.getTime() - 30 * MIN);
    var reserved = isReserved(id), online = e.kind !== 'offline';
    var ready = reserved && online && n >= opens && n <= end;
    return {
      reserved: reserved, online: online, offline: e.kind === 'offline' || !!(e.venues && e.venues.length),
      opensAt: opens.toISOString(), ready: ready, zoomUrl: ready ? (e.zoomUrl || DATA.SITE.zoomPlaceholder) : null,
      live: n >= start && n <= end, ended: n > end, startsInMin: Math.round((start - n) / MIN),
      venue: reserved ? (e.venue || null) : null, venues: reserved ? (e.venues || []) : [], place: e.place
    };
  }
  function todayEvents() {
    var n = now();
    return allEvents().filter(function (e) {
      var end = new Date(new Date(e.at).getTime() + (e.min || 60) * MIN);
      return sameDay(e.at, n) && end > n && !attended(e.id) && listed(e);
    }).sort(function (a, b) { return new Date(a.at) - new Date(b.at); })
      .map(function (e) { return Object.assign({}, e, { reserved: isReserved(e.id), access: eventAccess(e.id) }); });
  }
  function attendees(id) {
    var e = event(id);
    if (!e) return { count: 0, list: [] };
    var list = [];
    (e.attendees || []).forEach(function (no) {
      var p = rosterPerson(DATA.ROSTER_INDEX[no]);
      if (p && !p.me) list.push(p);
    });
    var reserved = isReserved(id);
    if (reserved) list.unshift(person('me'));
    return { count: list.length, list: list };
  }
  var PROPOSAL_LABELS = { review: '確認中', approved: '掲載中', rejected: '見送り' };
  function shapeProposal(p) {
    // 成果発表会の発表は「載る」ものではないので、決まったら「決定」（お知らせの「発表が決まりました」と同じ言葉）
    var label = p.kind === 'speaker' && p.status === 'approved' ? '決定' : PROPOSAL_LABELS[p.status] || '';
    var o = Object.assign({ statusLabel: label, tag: p.status === 'approved' ? 'confirmed' : p.status === 'rejected' ? 'canceled' : 'review' }, p);
    if (p.kind === 'speaker' && p.event && !p.at) { var e = event(p.event); if (e) o.eventAt = e.at; }
    return o;
  }
  function proposals() {
    return (S().proposals || []).map(shapeProposal).sort(function (a, b) { return new Date(b.sentAt || 0) - new Date(a.sentAt || 0); });
  }
  var MONEY_RE = /[0-9０-９][0-9０-９,，.]*\s*(円|万)/;
  function proposeEvent(form) {
    form = form || {}; var e = {};
    var title = str(form.title), desc = str(form.desc), at = form.at ? new Date(form.at) : null;
    var online = form.online === true || form.online === 'true' || form.online === 'online' || form.online === '1';
    var cap = parseInt(halfWidth(form.cap), 10);
    if (!title) e.title = '題を入れてください'; else if (title.length > 40) e.title = '40文字までにしてください';
    if (!at || isNaN(at)) e.at = '日時を選んでください';
    else if (at < endOfDay(now())) e.at = '開催日は明日以降にしてください';
    if (!online && !str(form.place)) e.place = '場所を入れてください（市区町村まで）';
    if (!(cap >= 2 && cap <= 100)) e.cap = '定員は2〜100で入れてください';
    if (!desc) e.desc = '内容を入れてください'; else if (desc.length > 1000) e.desc = '1000文字までにしてください';
    var hit = checkBanned(title + '\n' + desc);
    if (hit.length && !e.desc) e.desc = 'この内容は載せられません（' + hit.join('・') + '）';
    if (keys(e).length) return { ok: false, errors: e };
    var p = { id: uid('ep'), kind: 'event', title: title, at: at.toISOString(), online: online, place: online ? 'オンライン' : str(form.place),
      cap: cap, fee: str(form.fee) || '無料', desc: desc, status: 'review', sentAt: nowIso() };
    update(function (s) { slot(s, 'proposals', []).push(p); });
    return { ok: true, proposal: shapeProposal(p) };
  }
  function speakerApp(id) { return proposals().filter(function (p) { return p.kind === 'speaker' && p.event === id && p.status !== 'rejected'; })[0] || null; }
  function applySpeaker(id, title) {
    var e = event(id);
    title = str(title);
    if (!e || e.kind !== 'showcase' || new Date(e.at) <= now()) return { ok: false, error: 'この会には発表を申し込めません' };
    if (speakerApp(id)) return { ok: false, error: 'もう申し込んでいます' };
    if (!title) return { ok: false, errors: { title: '発表の題を入れてください' } };
    if (title.length > 40) return { ok: false, errors: { title: '40文字までにしてください' } };
    if (MONEY_RE.test(title) || checkBanned(title).length) return { ok: false, errors: { title: '題に金額は入れないでください' } };
    var p = { id: uid('sp'), kind: 'speaker', event: id, title: title, status: 'review', sentAt: nowIso() };
    update(function (s) {
      slot(s, 'proposals', []).push(p);
      // 発表する人は予約もしておく（満席でなければ）
      if (!s.events[id] && !isFull(e)) s.events[id] = nowIso();
    });
    return { ok: true, proposal: shapeProposal(p), reserved: isReserved(id) };
  }

  /* ---------- 紹介プログラム ----------
     報酬の明細は、紹介した人ごと・月ごとに作る。
     状態：hold（保留：初回決済から30日以内）→ confirmed（確定）→ scheduled（支払予定）→ paid（支払済）／ void（取消） */
  var REWARD_STATUS = { hold: '保留', confirmed: '確定', scheduled: '支払予定', paid: '支払済', void: '取消' };
  function initials(name) {
    var kana = { '佐々木': 'S', '清水': 'S', '山本': 'Y', '伊藤': 'I', '渡辺': 'W', '中島': 'N', '小川': 'O', '井上': 'I', '木村': 'K', '林': 'H', '山口': 'Y', '松田': 'M', '岡田': 'O', '藤井': 'F' };
    var fam = String(name || '').split(/\s+/)[0];
    return (kana[fam] || fam.charAt(0)) + '.さん';
  }
  /** 紹介した相手は頭文字だけ（PEOPLE.initial → referred[].initial → 名前の頭） */
  function whoRef(r) {
    var p = r.person && DATA.PEOPLE[r.person];
    var ini = r.initial || (p && p.initial);
    return ini ? ini + '.さん' : initials(person(r.person).name);
  }
  /** 紹介報酬の、月 m（0始まり。年をまたいでよい）の支払日（payDay。土日なら次の月曜） */
  function refPayIn(y, m) { return bizDay(new Date(y, m, DATA.REFERRAL.payDay, 10)); }
  /** 締めた月（closing）の翌月の支払日 */
  function payDateAfter(closing) { return refPayIn(closing.getFullYear(), closing.getMonth() + 1); }
  /** 紹介した人の会員番号（PEOPLE の人は PEOPLE の no、名簿の人は referred[].no） */
  function refNo(r) { var p = r && r.person && DATA.PEOPLE[r.person]; return (p && p.no) || (r && r.no) || ''; }
  /** 明細の1行 = 紹介した人の1回ぶんの決済。
      決済から holdDays 日は保留 → 確定 → その月末で締めて支払予定 → 支払日を過ぎたら支払済。
      保留中に退会があれば取消。運営が付けたもの（rewardStatus：確定・締め・支払い・取消）はそれを優先。
      振込先がないまま支払日が過ぎた行は、支払済にしない（支払予定のまま次の支払日へ繰り越す。carried・note）。
      行の形：{ id, ref, who, at, amount, status, label, confirmAt, payAt, paidAt, confirmedBy, scheduledBy, carried?, note?, voidAt?, voidReason? } */
  function rewardRows() {
    var s = S(), RF = DATA.REFERRAL, n = now(), rows = [], ov = s.rewardStatus || {};
    (s.referred || []).forEach(function (r) {
      var joined = new Date(r.joinedAt);
      var left = r.leftAt ? new Date(r.leftAt) : null;
      var months = RF.model === 'once' ? 1 : Math.max(1, Math.floor(((left || n) - joined) / (30 * DAY)) + 1);
      for (var i = 0; i < months; i++) {
        var at = new Date(joined.getTime() + i * 30 * DAY);
        if (at > n) break;
        var confirmAt = new Date(at.getTime() + RF.holdDays * DAY);
        var closing = new Date(confirmAt.getFullYear(), confirmAt.getMonth() + 1, 0, 23, 59);
        var pay = payDateAfter(closing);
        var id = r.id + '-' + (i + 1), o = ov[id];
        var status, paidAt = null, extra = {};
        if (o && o.status === 'void') { status = 'void'; extra.voidAt = o.at; extra.voidReason = o.reason || ''; }
        else if (left && left < confirmAt) { status = 'void'; extra.voidAt = left.toISOString(); extra.voidReason = '紹介した方が' + RF.holdDays + '日以内に退会した'; }
        else if (n < confirmAt) status = 'hold';
        else if (o && o.status === 'paid') { status = 'paid'; paidAt = o.at; }
        else {
          // 運営が月末に締めた行（支払予定）は、決めた支払日（payAt）。繰り越したら、その先の支払日
          var staff = !!o && o.status === 'scheduled';
          var base = staff && valid(o.payAt) ? new Date(o.payAt) : pay;
          var nth = function (k) { return k ? refPayIn(base.getFullYear(), base.getMonth() + k) : base; };
          var st = settle(nth, n);
          pay = st ? st.at : base;
          if (st && st.paid) { status = 'paid'; paidAt = pay.toISOString(); }
          else if (st) { status = 'scheduled'; extra.carried = true; extra.note = CARRY_NOTE[st.bank ? 'late' : 'none']; }
          else status = staff || n > closing ? 'scheduled' : 'confirmed';
          if (!extra.note && staff && o.note) { extra.carried = true; extra.note = o.note; }   // payMonth が繰り越した（最低額に届かない）
        }
        var amount = RF.model === 'once' ? RF.onceAmount : Math.round(DATA.SITE.price * RF.rate);
        rows.push(Object.assign({ id: id, ref: r.id, who: whoRef(r), at: at.toISOString(), amount: amount,
          status: status, label: REWARD_STATUS[status], confirmAt: confirmAt.toISOString(), payAt: pay.toISOString(), paidAt: paidAt,
          confirmedBy: o && (o.status === 'confirmed' || o.status === 'scheduled') ? 'staff' : null, scheduledBy: o && o.status === 'scheduled' ? 'staff' : null }, extra));
      }
    });
    return rows.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  /** 運営画面から：紹介報酬の明細を取り消す（紹介した方の決済を返金したときなど）。保留・確定・支払予定の行だけ。
      rowOrQuery は明細の id か { no（紹介した方の会員番号）, at（返金した決済の日時） }。
      { no, at } の形で、その人がこの会員の紹介でなければ何もせず { ok:true, other:true }（ほかの会員の明細は運営画面の記録だけ）。
      会員にお知らせ（取り消した額と理由）→ { ok, row } / { ok:false, error } */
  function voidReward(rowOrQuery, reason) {
    var rows = rewardRows(), row = null;
    if (rowOrQuery && typeof rowOrQuery === 'object') {
      var no = str(rowOrQuery.no), t = valid(rowOrQuery.at) ? new Date(rowOrQuery.at).getTime() : null;
      var refs = (S().referred || []).filter(function (r) { return no && refNo(r) === no; }).map(function (r) { return r.id; });
      if (!refs.length) return { ok: true, other: true };
      var mine = rows.filter(function (x) { return refs.indexOf(x.ref) >= 0; });
      // 決済の日時がその行の30日の中に入るもの。なければいちばん近い行
      row = t == null ? null : mine.filter(function (x) { var a = new Date(x.at).getTime(); return t >= a - DAY && t < a + 30 * DAY; })[0] || null;
      if (!row && t != null) row = mine.slice().sort(function (a, b) { return Math.abs(new Date(a.at) - t) - Math.abs(new Date(b.at) - t); })[0] || null;
    } else row = byId(rows, str(rowOrQuery));
    if (!row) return { ok: false, error: '明細が見つかりません' };
    if (row.status === 'void') return { ok: false, error: 'すでに取消の明細です' };
    if (row.status === 'paid') return { ok: false, error: '支払い済みの明細は取り消せません' };
    var why = str(reason) || '紹介した方の決済が返金された';
    update(function (s) {
      slot(s, 'rewardStatus', {})[row.id] = { status: 'void', at: nowIso(), reason: why };
      addNotice(s, 'referral', '紹介報酬 ' + yenText(row.amount) + '（' + row.who + '・' + md(row.at) + 'の決済の分）を取り消しました', '#/referral');
    });
    return { ok: true, row: byId(rewardRows(), row.id) };
  }
  function referral() {
    var s = S(), m = me(), RF = DATA.REFERRAL, n = now();
    var list = (s.referred || []).map(function (r) {
      var held = (n - new Date(r.joinedAt)) / DAY < RF.holdDays;
      return Object.assign({ who: whoRef(r), held: held,
        confirmAt: new Date(new Date(r.joinedAt).getTime() + RF.holdDays * DAY).toISOString() }, r);
    });
    var active = list.filter(function (r) { return r.status === 'active'; });
    var per = RF.model === 'once' ? RF.onceAmount : Math.round(DATA.SITE.price * RF.rate);
    var rows = rewardRows();
    var sum = function (st) { return rows.filter(function (x) { return st.indexOf(x.status) >= 0; }).reduce(function (a, x) { return a + x.amount; }, 0); };
    // 次の支払日：確定・支払予定の明細のうち、いちばん早いもの。無ければ最初に確定する明細の支払日
    var pending = rows.filter(function (x) { return x.status === 'confirmed' || x.status === 'scheduled'; });
    if (!pending.length) pending = rows.filter(function (x) { return x.status === 'hold'; });
    pending.sort(function (a, b) { return new Date(a.payAt) - new Date(b.payAt); });
    var pay = pending.length ? new Date(pending[0].payAt) : null;
    var url = DATA.SITE.siteUrl + '?ref=' + encodeURIComponent(m.refCode);
    return {
      code: m.refCode, url: url,
      model: RF.model, rate: RF.rate, perPerson: per, holdDays: RF.holdDays, minPayout: RF.minPayout,
      list: list, active: active.length,
      monthly: RF.model === 'once' ? 0 : active.length * per,
      held: sum(['hold']), confirmed: sum(['confirmed', 'scheduled']), paid: sum(['paid']),
      rows: rows, clicks: s.refClicks || 0,
      recent: list.filter(function (r) { return (n - new Date(r.joinedAt)) / DAY <= 30; }).length,
      payDate: pay ? pay.toISOString() : null, closeLabel: '月末締め・翌月' + RF.payDay + '日払い（土日は翌営業日）',
      bank: bank(),
      shareText: DATA.SHARE_TEMPLATE.replace('{site}', DATA.SITE.name).replace('{price}', DATA.SITE.price.toLocaleString('ja-JP')).replace('{url}', url)
    };
  }

  /* ---------- 貢献ポイントとランキング ----------
     暦の月（1日〜月末）で数える（画面の「9月の貢献ポイント」と合わせる）。 */
  function pointEntries() {
    return (S().pointsLog || []).map(function (l, i) { return Object.assign({ id: 'pl-' + i }, l); });
  }
  function points() {
    var n = now(), cur = monthRange(0), last = monthRange(-1);
    var log = pointEntries().filter(function (l) { return !l.revoked && new Date(l.at) <= n && (n - new Date(l.at)) / DAY <= 365; })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    var sum = function (list) { return list.reduce(function (a, l) { return a + (l.pt || 0); }, 0); };
    var month = sum(log.filter(function (l) { return inRange(l.at, cur); }));
    return { total: sum(log), month: month, recent: month, lastMonth: sum(log.filter(function (l) { return inRange(l.at, last); })),
      monthNo: cur.month, monthEnd: cur.last.toISOString(), log: log };
  }
  function xpIn(r) { return S().xpLog.filter(function (l) { return inRange(l.at, r) && new Date(l.at) <= now(); }).reduce(function (a, l) { return a + (l.xp || 0); }, 0); }
  function pointsIn(r) { return pointEntries().filter(function (l) { return !l.revoked && inRange(l.at, r) && new Date(l.at) <= now(); }).reduce(function (a, l) { return a + (l.pt || 0); }, 0); }
  /** ほかの会員に、この会員の操作で付いたpt（押した「ありがとう」・運営が選んだ回答・運営が付けたpt） */
  function liveBonus(range) {
    var s = S(), out = {};
    function add(pid, pt) {
      if (!pid || isMe(pid)) return;
      var r = DATA.ROSTER_INDEX && DATA.ROSTER_INDEX[pid];
      if (r && r.person && r.person !== 'demo') pid = r.person;
      var p = DATA.PEOPLE[pid];
      if (p && p.staff) return;
      out[pid] = (out[pid] || 0) + pt;
    }
    keys(s.thanks).forEach(function (cid) {
      if (!inRange(s.thanks[cid], range)) return;
      var f = findComment(cid); if (f && f.source !== 'me') add(f.c.by, rule('thanks').pt);
    });
    keys(s.answerMarks).forEach(function (cid) {
      if (!inRange(s.answerMarks[cid], range)) return;
      var f = findComment(cid); if (f && f.source !== 'me') add(f.c.by, rule('answer').pt);
    });
    (s.pointGrants || []).forEach(function (g) { if (!g.revoked && inRange(g.at, range)) add(g.person, g.pt); });
    return out;
  }
  /** 先月の値（ほかの人の記録は今月の分しかないので、人ごとに決まった割合で見込む） */
  function lastMonthOf(v, key, step) {
    var h = 0; String(key).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
    var f = 0.6 + (h % 70) / 100;
    return Math.round(v * f / step) * step;
  }
  function rankRow(p, v) {
    return { person: p.me ? 'me' : (DATA.PEOPLE[p.id] ? p.id : null), id: p.me ? 'me' : p.id, no: p.no || '', name: p.name, area: p.area || '',
      color: p.color, lv: p.lv, photo: p.photo || '', value: v, me: !!p.me, href: '#/members/' + encodeURIComponent(p.me ? 'me' : p.id) };
  }
  /** kind: 'points'（貢献）/ 'xp'（学び）。opt.month: 0 今月 / -1 先月 */
  function ranking(kind, opt) {
    opt = opt || {};
    kind = kind === 'xp' ? 'xp' : 'points';
    var off = opt.month === -1 || opt.month === 'last' ? -1 : 0;
    var range = monthRange(off), step = kind === 'xp' ? 10 : 2;
    var bonus = kind === 'points' ? liveBonus(range) : {};
    var seen = {}, rows = [];
    DATA.RANKING.forEach(function (r) {
      seen[r.person] = true;
      if (isMe(r.person)) return;
      var v = kind === 'xp' ? r.xp : r.points;
      if (off) v = lastMonthOf(v, r.person, step);
      rows.push(rankRow(person(r.person), v + (bonus[r.person] || 0)));
    });
    (DATA.ROSTER || []).forEach(function (m) {
      if (m.status === 'left' || (m.person && seen[m.person])) return;
      var p = rosterPerson(m);
      if (!p || p.me || p.staff) return;
      var v = kind === 'xp' ? m.monthXp : m.monthPoints;
      if (off) v = lastMonthOf(v, m.no, step);
      rows.push(rankRow(p, (v || 0) + (bonus[p.id] || 0)));
    });
    rows.push(rankRow(person('me'), kind === 'xp' ? xpIn(range) : pointsIn(range)));
    // 同じ値なら自分を上に（入ったばかりの0ptの人が、0ptの人の最後に並ばないように）
    rows.sort(function (a, b) { return b.value - a.value || (a.me ? -1 : b.me ? 1 : 0); });
    var P = DATA.RANK_PRIZES || [];
    rows.forEach(function (r, i) {
      r.rank = i + 1;
      if (kind === 'points' && r.value > 0 && i < 10) {
        r.prize = i === 0 ? P[0] : i < 3 ? P[1] : P[2];
        if (off && i < 3) r.prizeStatus = '連絡済み';
      }
    });
    return rows;
  }
  function rankTotal(kind, opt) { return ranking(kind, opt).filter(function (r) { return r.value > 0; }).length; }

  /* ---------- メッセージ ---------- */
  function thread() { return S().thread.filter(function (m) { return isDue(m.at); }); }
  function unread() {
    var s = S(), since = s.threadRead ? new Date(s.threadRead) : null;
    return thread().filter(function (m) { return m.from !== 'me' && (!since || new Date(m.at) > since); }).length;
  }
  function markRead() { update(function (s) { s.threadRead = nowIso(); }); }
  function normAttachments(list) {
    return (list || []).slice(0, 4).map(function (a) {
      if (!a) return null;
      var name = str(a.name) || 'ファイル', type = a.type === 'image' || /^image\//.test(a.type || '') ? 'image' : /pdf/.test(a.type || '') || /\.pdf$/i.test(name) ? 'pdf' : 'file';
      var url = typeof a.url === 'string' && a.url.length <= 400000 && /^data:(image\/(png|jpe?g|webp|gif)|application\/pdf);base64,/.test(a.url) ? a.url : '';
      return { name: name.slice(0, 80), type: type, size: +a.size || 0, url: url };
    }).filter(Boolean);
  }
  function slotsText(list) { return list.map(function (x) { return '・' + x.label; }).join('\n'); }
  /** 送る。試作版は、すぐの自動返信と、5秒ほどあとの担当の返事が届く。
      面談の予約は bookMeeting で確定するので、ここではスタートガイドを済にしない */
  function sendMessage(text, kind, attachments, ref) {
    text = str(text);
    var att = normAttachments(attachments);
    if (!text && !att.length) return Promise.resolve(null);
    var msg = { from: 'me', at: nowIso(), text: text, kind: kind || '' };
    if (att.length) msg.attachments = att;
    if (ref) msg.ref = String(ref);
    update(function (s) { s.thread.push(msg); s.threadRead = nowIso(); });
    var sentFrom = S();
    var AR = DATA.AUTO_REPLIES || {};
    var pair = AR[kind] || AR['その他'] || ['ありがとうございます。確認して今日中に返信します。', ''];
    function reply(t, auto) {
      // 待っているあいだに「デモを最初から」などで別の会員になっていたら、返事は捨てる
      if (!t || S() !== sentFrom) return null;
      var m = { from: 'staff2', at: nowIso(), text: t };
      if (auto) m.auto = true;
      // 既読にはしない。メッセージ画面を開いていれば、その画面が既読にする
      update(function (s) { s.thread.push(m); });
      return m;
    }
    return new Promise(function (resolve) {
      setTimeout(function () {
        var first = reply(pair[0], true);
        if (!first) { resolve(null); return; }
        // 運営画面が開いているときは、担当の返事を作らない（運営が本当に返すので、未返信のままにしておく）
        var next = adminOpen() ? Promise.resolve(null) : new Promise(function (r2) {
          setTimeout(function () { r2(adminOpen() ? null : reply(String(pair[1] || '').replace('{slots}', slotsText(meetingSlots())))); }, 5000);
        });
        resolve({ xp: 0, reply: first, next: next });
      }, 1600);
    });
  }
  /** 運営画面の「面談の枠」（毎週の枠と休みの日）から、次の候補を3つ（別の日）。枠がまだ無ければ null */
  function dayKey(d) { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  /** 面談の枠の設定：運営画面が R.setMeetingSlots で書いたもの（state.settings.meetSlots）→ 運営画面の保存の meetSlots の順 */
  function slotConfig() {
    var cfg = (S().settings || {}).meetSlots;
    if (cfg && ((Array.isArray(cfg.weekly) && cfg.weekly.length) || (Array.isArray(cfg.fixed) && cfg.fixed.length))) return cfg;
    var db = adminDb();
    return db && db.meetSlots && Array.isArray(db.meetSlots.weekly) && db.meetSlots.weekly.length ? db.meetSlots : null;
  }
  function adminSlots() {
    var db = adminDb(), cfg = slotConfig();
    if (!cfg) return null;
    var off = {}, taken = {};
    (cfg.off || []).forEach(function (o) { if (o && valid(o.at)) off[dayKey(o.at)] = true; });
    // 予約の入っている時刻（ほかの会員の面談と、自分の予約）は出さない
    ((db && db.interviews) || []).forEach(function (x) { if (x && (x.status === 'pending' || x.status === 'confirmed') && valid(x.at)) taken[Math.round(new Date(x.at) / MIN)] = true; });
    meetings().forEach(function (m) { if (m.status !== 'canceled') taken[Math.round(new Date(m.at) / MIN)] = true; });
    // 日時を決めて出した枠（fixed）：これからのもので、埋まっていないものを早い順に3つ
    if (Array.isArray(cfg.fixed) && cfg.fixed.length) {
      var fx = cfg.fixed.filter(valid).map(function (x) { return new Date(x); })
        .filter(function (x) { return x > now() && !off[dayKey(x)] && !taken[Math.round(x / MIN)]; })
        .sort(function (a, b) { return a - b; }).slice(0, 3);
      return fx.length ? fx : null;
    }
    var base = new Date(now()); base.setHours(0, 0, 0, 0);
    var out = [], seen = {};
    for (var i = 1; i <= 28 && out.length < 3; i++) {
      var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      if (off[dayKey(d)]) continue;
      cfg.weekly.filter(function (w) { return w && +w.dow === d.getDay() && /^\d{1,2}:\d{2}$/.test(String(w.time)); })
        .sort(function (a, b) { return String(a.time) < String(b.time) ? -1 : 1; })
        .forEach(function (w) {
          if (seen[dayKey(d)] || out.length >= 3) return;
          var t = String(w.time).split(':'), at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +t[0], +t[1]);
          if (at <= now() || taken[Math.round(at / MIN)]) return;
          seen[dayKey(d)] = true; out.push(at);
        });
    }
    return out.length ? out : null;
  }
  /** 面談の候補：運営画面の枠があればそこから。なければ明日からの平日の夜2つ（別の日）と、土曜の午前 */
  function meetingSlots() {
    var fromAdmin = null;
    try { fromAdmin = adminSlots(); } catch (e) { fromAdmin = null; }
    if (fromAdmin) {
      return fromAdmin.map(function (x) { return { id: 'sl-' + x.getTime().toString(36), at: x.toISOString(), label: mdw(x) + ' ' + hm(x) }; });
    }
    var base = new Date(now()); base.setDate(base.getDate() + 1); base.setHours(0, 0, 0, 0);
    var list = [], d = new Date(base), hs = [21, 21.5];
    while (list.length < 2) {
      if (d.getDay() !== 0 && d.getDay() !== 6) { var t = new Date(d); var h = hs[list.length]; t.setHours(Math.floor(h), (h % 1) * 60, 0, 0); list.push(t); }
      d.setDate(d.getDate() + 1);
    }
    var sat = new Date(base); while (sat.getDay() !== 6) sat.setDate(sat.getDate() + 1); sat.setHours(10, 0, 0, 0);
    list.push(sat);
    return list.sort(function (a, b) { return a - b; }).map(function (x) {
      return { id: 'sl-' + x.getTime().toString(36), at: x.toISOString(), label: mdw(x) + ' ' + hm(x) };
    });
  }
  /** 運営画面から：面談の枠を決める（会員ページの面談の候補になる。人を切り替えても残る）。
      slots：{ weekly:[{dow（0＝日）, time:'21:00'}], off?:[{at, why}], min? } か、毎週の枠の配列、
      日時を決めた枠の配列（['2026-09-30T21:00…'] か [{at}]）。null で消す（運営画面の保存 → 決まった候補に戻る） */
  function setMeetingSlots(slots) {
    var cfg = null;
    if (slots != null) {
      var o = Array.isArray(slots) ? null : slots, list = Array.isArray(slots) ? slots : null;
      if (list && list.some(function (x) { return typeof x === 'string' || (x && x.at); })) o = { fixed: list };
      else if (list) o = { weekly: list };
      if (!o || typeof o !== 'object') return { ok: false, error: '面談の枠の形が正しくありません' };
      var weekly = (o.weekly || []).filter(function (w) { return w && +w.dow >= 0 && +w.dow <= 6 && /^\d{1,2}:\d{2}$/.test(String(w.time)); })
        .map(function (w) { var t = String(w.time).split(':'); return { dow: +w.dow, time: (+t[0]) + ':' + t[1], staff: w.staff || null }; });
      var fixed = (o.fixed || []).map(function (x) { return typeof x === 'string' ? x : x && x.at; }).filter(valid)
        .map(function (x) { return new Date(x).toISOString(); });
      var off = (o.off || []).filter(function (x) { return x && valid(x.at); }).map(function (x) { return { at: new Date(x.at).toISOString(), why: str(x.why) }; });
      if (!weekly.length && !fixed.length) return { ok: false, error: '面談の枠を1つ以上入れてください' };
      cfg = { min: Math.max(5, Math.min(60, parseInt(o.min, 10) || 15)), weekly: weekly, off: off };
      if (fixed.length) cfg.fixed = fixed;
    }
    update(function (s) { var st = slot(s, 'settings', {}); if (cfg) st.meetSlots = cfg; else delete st.meetSlots; });
    return { ok: true, config: cfg, slots: meetingSlots() };
  }
  /** いまの面談の枠の設定（運営画面が表示に使う）。無ければ null */
  function meetingSlotConfig() { var c = slotConfig(); return c ? JSON.parse(JSON.stringify(c)) : null; }
  var MEETING_LABELS = { pending: '確認中', confirmed: '予約確定', canceled: '取り消し' };
  function meetingMsgs(s) { return (s.thread || []).filter(function (m) { return m.card && m.card.type === 'meeting' && m.from === 'me'; }); }
  function shapeMeeting(c) { return c ? Object.assign({ label: MEETING_LABELS[c.status] || '', when: mdw(c.at) + ' ' + hm(c.at) }, c) : null; }
  function meetings() {
    return meetingMsgs(S()).map(function (m) { return shapeMeeting(m.card); }).sort(function (a, b) { return new Date(b.bookedAt) - new Date(a.bookedAt); });
  }
  function meeting(id) {
    var list = meetings();
    if (id) return list.filter(function (c) { return c.id === id; })[0] || null;
    return list.filter(function (c) { return c.status !== 'canceled'; })[0] || null;
  }
  function bookMeeting(slotArg) {
    var at = slotArg && typeof slotArg === 'object' ? slotArg.at : ((byId(meetingSlots(), slotArg) || {}).at || slotArg);
    if (!valid(at) || new Date(at) <= now()) return null;
    var id = uid('mt'), when = mdw(at) + ' ' + hm(at);
    update(function (s) {
      // 日時を変えるときは、前の予約を取り消してから新しく入れる
      meetingMsgs(s).forEach(function (m) { if (m.card.status !== 'canceled') m.card.status = 'canceled'; });
      s.thread.push({ from: 'me', kind: '面談の予約', at: nowIso(), text: when + 'でお願いします。',
        card: { type: 'meeting', id: id, at: new Date(at).toISOString(), status: 'pending', min: 15, bookedAt: nowIso() } });
      s.threadRead = nowIso();
    });
    var sentFrom = S();
    // 試作版：少しあとで運営が確定する。運営画面が開いていれば、運営が「確定する」を押すのを待つ（ここでは確定しない）
    var confirmed = new Promise(function (resolve) {
      setTimeout(function () { resolve(S() === sentFrom && !adminOpen() ? confirmMeeting(id) : null); }, 2400);
    });
    return { card: meeting(id), confirmed: confirmed };
  }
  function confirmMeeting(id) {
    var m = meetingMsgs(S()).filter(function (x) { return x.card.id === id; })[0];
    if (!m || m.card.status !== 'pending') return null;
    var when = mdw(m.card.at) + ' ' + hm(m.card.at), zoom = DATA.SITE.zoomPlaceholder;
    update(function (s) {
      var b = meetingMsgs(s).filter(function (x) { return x.card.id === id; })[0];
      b.card.status = 'confirmed'; b.card.zoomUrl = zoom; b.card.confirmedAt = nowIso();
      s.thread.push({ from: 'staff2', at: nowIso(), ref: 'meeting:' + id,
        text: when + 'で予約しました。当日はこのリンクから入ってください。\n' + zoom + '\nカメラはオフでもかまいません。' });
    });
    return completeStep('meet') || { xp: 0 };
  }
  function cancelMeeting(id) {
    var m = meetingMsgs(S()).filter(function (x) { return x.card.id === id; })[0];
    if (!m || m.card.status === 'canceled') return false;
    var when = mdw(m.card.at) + ' ' + hm(m.card.at);
    update(function (s) {
      var b = meetingMsgs(s).filter(function (x) { return x.card.id === id; })[0];
      b.card.status = 'canceled';
      s.thread.push({ from: 'me', kind: '面談の予約', at: nowIso(), text: when + 'の面談を取り消します。' });
      s.threadRead = nowIso();
    });
    return true;
  }

  /* 専門家への相談（受付 → 日程調整 → 予約確定 → 相談済み） */
  var EXPERT_STEPS = ['受付', '日程調整', '予約確定', '相談済み'];
  var EXPERT_TAG = { '受付': 'pending', '日程調整': 'meeting', '予約確定': 'reserved', '相談済み': 'done' };
  function shapeExpert(r) {
    var ex = byId(DATA.EXPERTS, r.expert) || { title: '専門家' };
    return Object.assign({ ex: ex, who: ex.person ? person(ex.person) : null, stepIndex: Math.max(0, EXPERT_STEPS.indexOf(r.status)),
      tag: EXPERT_TAG[r.status] || 'pending' }, r);
  }
  function expertRequests() {
    return (S().expertRequests || []).map(shapeExpert).sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  function advanceExpert(reqId, status) {
    var r = byId(S().expertRequests, reqId);
    if (!r) return null;
    var next = status || EXPERT_STEPS[EXPERT_STEPS.indexOf(r.status) + 1];
    if (!next || EXPERT_STEPS.indexOf(next) < 0 || next === r.status) return shapeExpert(r);
    update(function (s) {
      var x = byId(s.expertRequests, reqId);
      x.status = next; x.history = (x.history || []).concat([{ at: nowIso(), status: next }]);
      var ex = byId(DATA.EXPERTS, x.expert) || { title: '専門家' };
      addNotice(s, 'reply', ex.title + 'への相談：' + next, '#/perks?tab=experts');
    });
    return shapeExpert(byId(S().expertRequests, reqId));
  }
  function requestExpert(expertId, form) {
    form = form || {};
    var ex = byId(DATA.EXPERTS, expertId);
    if (!ex) return { ok: false, error: '専門家が見つかりません' };
    var text = str(form.text), when = str(form.when), e = {};
    if (!text) e.text = '相談したいことを入れてください';
    else if (text.length < 10) e.text = 'もう少しくわしく書いてください（10文字以上）';
    else if (text.length > 1000) e.text = '1000文字までにしてください';
    if (when.length > 100) e.when = '100文字までにしてください';
    if (keys(e).length) return { ok: false, errors: e };
    var req = { id: uid('x'), expert: expertId, at: nowIso(), status: '受付', text: text, when: when, history: [{ at: nowIso(), status: '受付' }] };
    update(function (s) { slot(s, 'expertRequests', []).push(req); });
    // 試作版：少しあとで運営が日程の調整に入る（運営画面が開いていれば、運営が進めるのを待つ）
    var sentFrom = S();
    setTimeout(function () { if (S() === sentFrom && !adminOpen()) advanceExpert(req.id, '日程調整'); }, 4000);
    return { ok: true, request: shapeExpert(req) };
  }

  /* ---------- お知らせ（右上の鈴）と通知の設定 ---------- */
  var NOTICE_ICON = { reply: 'message', event_before: 'calendar', event_30min: 'clock', new_course: 'play', new_gig: 'briefcase', comment: 'comment', thanks: 'heart',
    reward_confirmed: 'gift', billing: 'receipt', referral: 'gift', gig: 'briefcase', system: 'bell', points: 'trophy' };
  /** ルールが出すお知らせ（運営の返信・回答に選ばれた・掲載の確認など）。state.extraNotices に入れる */
  function addNotice(s, type, text, link) {
    slot(s, 'extraNotices', []).push({ id: uid('xn'), type: type, icon: NOTICE_ICON[type] || 'bell', at: nowIso(), text: text, link: link || '', go: link || '' });
  }
  function readMap(s) { return s.noticesRead && typeof s.noticesRead === 'object' ? s.noticesRead : {}; }
  function notices(opt) {
    opt = opt || {};
    var s = S(), map = readMap(s);
    var since = typeof s.noticesRead === 'string' ? new Date(s.noticesRead) : null;   // 古い形（ここまで読んだ時刻）
    // 運営画面が直したお知らせ（data.js の分の文・リンク・非表示）と、運営が足したお知らせ（届け先が合うものだけ）
    var edits = DATA.NOTICE_EDITS || {};
    var base = DATA.noticesFor(s).map(function (x) {
      var r = edits[x.id];
      if (!r) return x;
      if (!cmsVisible(r)) return null;
      var o = Object.assign({}, x);
      if (r.text) o.text = r.text;
      if (r.link != null) { o.link = r.link; o.go = r.link; }
      if (r.type && NOTICE_ICON[r.type]) { o.type = r.type; o.icon = NOTICE_ICON[r.type]; }
      return o;
    }).filter(Boolean);
    var added = (DATA.CMS_NOTICES || []).filter(function (x) { return matchesTargetSafe(x.target || 'all'); })
      .map(function (x) { return Object.assign({}, x, { go: x.link || '', icon: NOTICE_ICON[x.type] || 'bell' }); });
    var list = base.concat(added, s.extraNotices || []).filter(function (x) { return isDue(x.at); })
      .map(function (x, i) {
        var link = x.link || x.go || '';
        return Object.assign({}, x, { link: link, go: link, icon: x.icon || NOTICE_ICON[x.type] || 'bell',
          unread: since ? new Date(x.at) > since : !map[x.id], _i: i });
      });
    // 同じ時刻なら、あとから足したものを上に
    list.sort(function (a, b) { return new Date(b.at) - new Date(a.at) || b._i - a._i; });
    list.forEach(function (x) { delete x._i; });
    if (opt.unreadOnly) list = list.filter(function (x) { return x.unread; });
    if (opt.limit) list = list.slice(0, opt.limit);
    return list;
  }
  function unreadNotices() { return notices({ unreadOnly: true }).length; }
  function markNoticeRead(id) {
    if (!id) return false;
    update(function (s) { if (!s.noticesRead || typeof s.noticesRead !== 'object') s.noticesRead = {}; if (!s.noticesRead[id]) s.noticesRead[id] = nowIso(); });
    return true;
  }
  function markAllNoticesRead() {
    var ids = notices().map(function (x) { return x.id; });
    update(function (s) {
      if (!s.noticesRead || typeof s.noticesRead !== 'object') s.noticesRead = {};
      ids.forEach(function (id) { if (!s.noticesRead[id]) s.noticesRead[id] = nowIso(); });
    });
    return ids.length;
  }
  function notifyPrefs() {
    var s = S(), pr = s.notifyPrefs || {}, lineReady = lineLink().status === 'linked';
    return (DATA.NOTIFY_TYPES || []).map(function (t) {
      var v = pr[t.id] || { line: !!t.line, email: !!t.email };
      return { id: t.id, name: t.name, fixed: !!t.fixed, line: t.fixed ? !!t.line : !!v.line, email: t.fixed ? !!t.email : !!v.email, lineReady: lineReady };
    });
  }
  function setNotifyPref(type, channel, on) {
    var t = byId(DATA.NOTIFY_TYPES, type);
    if (!t || t.fixed || (channel !== 'line' && channel !== 'email')) return false;
    update(function (s) {
      var pr = slot(s, 'notifyPrefs', {});
      pr[type] = pr[type] || { line: !!t.line, email: !!t.email };
      pr[type][channel] = !!on;
    });
    return true;
  }

  /* ---------- アカウント・安全 ----------
     試作版はパスワードを保存しない（本番は認証サーバーが照合する）。形の確かめと、画面の流れだけを再現する */
  var PW_MIN = 8;
  var PASSWORD_RULE = PW_MIN + '文字以上。英字と数字を両方入れる';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function containsIdentity(pw) {
    var m = me(), low = pw.toLowerCase();
    var digits = String(m.id || '').replace(/\D/g, ''), local = String(m.email || '').split('@')[0].toLowerCase();
    return (digits.length >= 6 && low.indexOf(digits) >= 0) || (local.length >= 4 && low.indexOf(local) >= 0);
  }
  function passwordErrors(next, again, cur) {
    var e = {};
    next = String(next == null ? '' : next); again = String(again == null ? '' : again);
    if (!next) e.next = '新しいパスワードを入れてください';
    else if (next.length < PW_MIN) e.next = PW_MIN + '文字以上にしてください';
    else if (next.length > 64) e.next = '64文字までにしてください';
    else if (/\s/.test(next)) e.next = 'スペースは使えません';
    else if (!/[A-Za-z]/.test(next) || !/[0-9]/.test(next)) e.next = '英字と数字を両方入れてください';
    else if (cur != null && next === cur) e.next = '今のパスワードと同じです';
    else if (containsIdentity(next)) e.next = '会員番号やメールアドレスは使えません';
    if (!again) e.again = 'もう一度入れてください';
    else if (next && again !== next) e.again = '新しいパスワードと一致しません';
    return e;
  }
  function onlyThisDevice(s) { var before = (s.sessions || []).length; s.sessions = (s.sessions || []).filter(function (x) { return x.current; }); return before - s.sessions.length; }
  function changePassword(cur, next, again) {
    cur = String(cur == null ? '' : cur);
    var e = {};
    if (!cur) e.cur = '今のパスワードを入れてください';
    else if (cur.length < PW_MIN) e.cur = '今のパスワードが違います';   // 8文字未満のパスワードは作れないので
    Object.assign(e, passwordErrors(next, again, cur));
    if (keys(e).length) return { ok: false, errors: e };
    var out = update(function (s) { s.passwordSetAt = nowIso(); return onlyThisDevice(s); });
    return { ok: true, at: S().passwordSetAt, loggedOut: out };
  }
  function validateLoginId(id) {
    var v = halfWidth(id).trim();
    if (!v) return { ok: false, error: '会員番号かメールアドレスを入れてください' };
    // 会員番号は TS-000000。前の頭（TK-）で覚えている人・ブラウザの入力の候補も、同じ番号として通す
    var m = /^T[SK]-?(\d{6})$/i.exec(v);
    if (m) return { ok: true, kind: 'no', value: 'TS-' + m[1] };
    if (EMAIL_RE.test(v)) return { ok: true, kind: 'email', value: v };
    return { ok: false, error: '会員番号（TS-から始まる番号）かメールアドレスを入れてください' };
  }
  /** 試作版：会員番号かメールが、いまの会員かデモ会員のもので、パスワードが8文字以上なら通す */
  function checkLogin(id, pw) {
    var v = validateLoginId(id);
    if (!v.ok) return { ok: false, field: 'id', error: v.error };
    if (!pw) return { ok: false, field: 'pw', error: 'パスワードを入れてください' };
    var m = me(), low = v.value.toLowerCase();
    var known = [m.id, m.email, DATA.MEMBER.id, DATA.MEMBER.email].map(function (x) { return String(x || '').toLowerCase(); });
    if (known.indexOf(low) < 0 || String(pw).length < PW_MIN) return { ok: false, field: 'both', error: '会員番号かパスワードが違います' };
    var demo = low === DATA.MEMBER.id.toLowerCase() || low === String(DATA.MEMBER.email).toLowerCase();
    return { ok: true, persona: demo ? 'demo' : 'current' };
  }
  function maskEmail(addr) {
    var p = String(addr || '').split('@');
    if (p.length !== 2) return '';
    return p[0].slice(0, 2) + '•••@' + p[1];
  }
  function requestPasswordReset(idOrEmail) {
    var v = validateLoginId(idOrEmail);
    if (!v.ok) return { ok: false, error: v.error };
    // 登録があるかどうかは答えない（他人のアドレスを確かめる道具にしないため）
    return { ok: true, to: v.kind === 'email' ? maskEmail(v.value) : '登録のメールアドレス', sentAt: nowIso(),
      expiresAt: plus(nowIso(), 24 * 60), link: '#/reset?token=demo' };
  }
  function checkResetToken(token) {
    token = str(token);
    if (token === 'expired') return { ok: false, expired: true, error: 'リンクの期限（24時間）が切れています。もう一度送ってください' };
    if (/^demo/.test(token)) return { ok: true, kind: /set/.test(token) ? 'set' : 'reset' };
    return { ok: false, error: 'リンクが正しくありません。メールのリンクをもう一度開いてください' };
  }
  function resetPassword(token, next, again) {
    var t = checkResetToken(token);
    if (!t.ok) return { ok: false, error: t.error, expired: !!t.expired };
    var e = passwordErrors(next, again);
    if (keys(e).length) return { ok: false, errors: e };
    update(function (s) { s.passwordSetAt = nowIso(); onlyThisDevice(s); });
    return { ok: true };
  }
  function setPassword(next, again, token) {
    if (token) { var t = checkResetToken(token); if (!t.ok) return { ok: false, error: t.error, expired: !!t.expired }; }
    var e = passwordErrors(next, again);
    if (keys(e).length) return { ok: false, errors: e };
    update(function (s) { s.passwordSetAt = nowIso(); });
    return { ok: true };
  }
  function needsPassword() { return !S().passwordSetAt; }
  function pendingEmail() {
    var p = S().emailPending;
    if (!p || !p.addr) return null;
    var exp = plus(p.at, 24 * 60);
    return { addr: p.addr, at: p.at, sentAt: p.sentAt || p.at, expiresAt: exp, expired: new Date(exp) < now() };
  }
  function requestEmailChange(addr) {
    addr = halfWidth(addr).trim();
    if (!addr) return { ok: false, error: '新しいメールアドレスを入れてください' };
    if (!EMAIL_RE.test(addr)) return { ok: false, error: 'メールアドレスの形を確かめてください' };
    if (addr.toLowerCase() === String(me().email || '').toLowerCase()) return { ok: false, error: 'いまのメールアドレスと同じです' };
    update(function (s) { s.emailPending = { addr: addr, at: nowIso(), sentAt: nowIso(), token: 'demo' }; });
    return { ok: true, pending: pendingEmail() };
  }
  function confirmEmailChange(token) {
    var p = S().emailPending, pe = pendingEmail();
    if (!p) return { ok: false, error: '確認待ちのメールアドレスはありません' };
    if (token != null && token !== '' && token !== p.token) return { ok: false, error: 'リンクが正しくありません' };
    if (pe.expired) return { ok: false, expired: true, error: 'リンクの期限が切れました。もう一度送ってください' };
    update(function (s) { s.me.email = p.addr; s.emailPending = null; });
    return { ok: true, email: me().email };
  }
  function cancelEmailChange() { update(function (s) { s.emailPending = null; }); return true; }
  function resendEmailChange() {
    var p = pendingEmail();
    if (!p) return { ok: false, error: '確認待ちのメールアドレスはありません' };
    var wait = 60 - (now() - new Date(p.sentAt)) / 1000;
    if (wait > 0) return { ok: false, wait: Math.ceil(wait), error: '送り直しは1分ほどあけてください' };
    update(function (s) { s.emailPending.sentAt = nowIso(); s.emailPending.at = nowIso(); });
    return { ok: true, pending: pendingEmail() };
  }
  function sessions() {
    return (S().sessions || []).slice().sort(function (a, b) { return (b.current ? 1 : 0) - (a.current ? 1 : 0) || new Date(b.lastAt) - new Date(a.lastAt); });
  }
  function logoutOthers() { return update(function (s) { return onlyThisDevice(s); }); }
  function logoutSession(id) {
    var x = byId(S().sessions, id);
    if (!x || x.current) return false;
    update(function (s) { s.sessions = s.sessions.filter(function (y) { return y.id !== id; }); });
    return true;
  }
  /* 記録の書き出し・削除の申込み（本番は運営が受けて処理する。プライバシーポリシーの開示・削除の請求） */
  var DATA_KINDS = { 'export': '記録の書き出し', 'delete': '記録の削除' };
  function dataRequests() {
    return (S().dataRequests || []).map(function (x) { return Object.assign({ label: DATA_KINDS[x.kind] || '' }, x); })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  function requestData(kind) {
    if (!DATA_KINDS[kind]) return { ok: false, error: '申し込む内容を選んでください' };
    var open = dataRequests().filter(function (x) { return x.kind === kind && x.status === 'received'; })[0];
    if (open) return { ok: true, existing: true, request: open };
    var req = { id: uid('dr'), kind: kind, at: nowIso(), status: 'received' };
    update(function (s) { slot(s, 'dataRequests', []).push(req); });
    return { ok: true, request: Object.assign({ label: DATA_KINDS[kind] }, req) };
  }
  function cancelDataRequest(id) {
    var x = byId(S().dataRequests, id);
    if (!x || x.status !== 'received') return false;
    update(function (s) { var y = byId(s.dataRequests, id); y.status = 'canceled'; y.canceledAt = nowIso(); });
    return true;
  }
  /** 運営画面から：記録の書き出し・削除の申込みを「済み」にする（会員にお知らせが届く） */
  function completeDataRequest(id) {
    var x = byId(S().dataRequests, id);
    if (!x) return { ok: false, error: '申込みが見つかりません' };
    if (x.status !== 'received') return { ok: false, error: x.status === 'done' ? 'もう済んでいます' : '取り消された申込みです' };
    update(function (s) {
      var y = byId(s.dataRequests, id); y.status = 'done'; y.doneAt = nowIso();
      // 文は会員ページのアカウントの「記録の書き出しと削除」と同じ言い方（書き出しはそこで保存する）
      addNotice(s, 'system', y.kind === 'export' ? '記録の書き出しができました。アカウントから保存できます' : '記録の削除の手続きが済みました', '#/account?focus=data');
    });
    return { ok: true, request: byId(dataRequests(), id) };
  }
  /* ログインを止める（運営画面）。会員ページの保存（state.loginBlock）と、運営画面の保存（terakoya-admin-v1 の members[会員番号].suspended）の
     両方を見て、新しく書かれたほうに従う（R.setLoginBlocked で書けば、開いている会員ページのタブもすぐ止まる・戻る） */
  function blockInfo() {
    var b = S().loginBlock, db = adminDb(), m = db && db.members && db.members[me().id];
    var dbOn = !!(m && m.suspended), dbAt = m && m.suspendedAt;
    if (b && b.at && (!dbOn || !dbAt || new Date(b.at) >= new Date(dbAt))) return b.on ? { at: b.at, reason: b.reason || '' } : null;
    return dbOn ? { at: dbAt || null, reason: m.suspendReason || '' } : null;
  }
  /** いまログインを止めているか → null か { at, reason }。no（会員番号）を渡したときは、その会員について（運営画面の保存を見る） */
  function loginBlocked(no) {
    if (no && no !== me().id && !isMe(no)) {
      var db = adminDb(), m = db && db.members && db.members[no];
      return m && m.suspended ? { at: m.suspendedAt || null, reason: m.suspendReason || '' } : null;
    }
    return blockInfo();
  }
  /** 運営画面から：この会員のログインを止める（on=true）・再開する（on=false） */
  function setLoginBlocked(on, reason) {
    on = !!on; reason = str(reason);
    update(function (s) { s.loginBlock = { on: on, at: nowIso(), reason: on ? reason : '' }; });
    return { ok: true, blocked: loginBlocked() };
  }
  /** 運営画面で「ログインを止める」にされているか（前からの名前。loginBlocked() と同じ） */
  function adminSuspension() { return blockInfo(); }

  /* ---------- 支払い ----------
     状態：active 有効 / canceling 解約予定 / ended 終了 / past_due 支払いエラー / paused 休会中
     解約は「次の請求日の前日まで使えて、そこで終わる」。途中の返金・違約金はなし */
  var PLAN_LABELS = { active: '有効', canceling: '解約予定', ended: '終了', past_due: '支払いエラー', paused: '休会中' };
  function addMonths(d, n) { return DATA.addMonths(d, n); }
  function bills() {
    var joined = me().joinedAt, n = now(), k = 1, next = addMonths(joined, 1);
    while (next <= n) { k++; next = addMonths(joined, k); }
    return { next: next, last: addMonths(joined, k - 1) };
  }
  function rejoinLink() {
    var p = S().plan || {}, end = p.endedAt || p.cancelAt;
    var keep = end ? plusDays(end, DATA.SITE.keepDays || 365).toISOString() : null;
    return { href: 'index.html#/join?rejoin=1', label: '再入会する', keepUntil: keep };
  }
  function plan() {
    var s = S(), p = s.plan || {}, SITE = DATA.SITE, n = now(), b = bills();
    var status = p.status || 'active';
    if (status === 'canceling' && p.cancelAt && new Date(p.cancelAt) <= n) status = 'ended';
    // 休会明け。休会中に解約していれば、休会が明けたところで終わる
    if (status === 'paused' && p.pausedUntil && new Date(p.pausedUntil) <= n) status = p.cancelAt ? 'ended' : 'active';
    var o = { status: status, label: PLAN_LABELS[status], price: SITE.price, card: me().card,
      nextBill: null, periodEnd: b.next.toISOString(), lastDay: null, cancelAt: p.cancelAt || null, lastBill: b.last.toISOString(),
      graceUntil: null, failedAt: null, endedAt: null, keepUntil: null, pausedUntil: null,
      canUse: true, limited: false, rejoin: null, allowPause: !!SITE.allowPause };
    if (status === 'active') o.nextBill = b.next.toISOString();
    if (status === 'canceling') {
      o.periodEnd = p.cancelAt || b.next.toISOString(); o.cancelAt = o.periodEnd;
      // 支払いエラーのまま解約した人は、猶予が過ぎたら止める（解約で使えるように戻さない）
      if (p.failedAt && p.graceUntil) { o.failedAt = p.failedAt; o.graceUntil = p.graceUntil; o.limited = n > new Date(p.graceUntil); o.canUse = !o.limited; }
    }
    if (status === 'ended') {
      o.endedAt = p.endedAt || p.cancelAt || b.last.toISOString();
      o.periodEnd = o.endedAt; o.cancelAt = p.cancelAt || o.endedAt;
      o.keepUntil = plusDays(o.endedAt, SITE.keepDays || 365).toISOString();
      o.canUse = false; o.rejoin = rejoinLink();
    }
    if (status === 'past_due') {
      o.failedAt = p.failedAt || b.last.toISOString();
      o.graceUntil = p.graceUntil || endOfDay(plusDays(o.failedAt, SITE.graceDays || 7)).toISOString();
      o.limited = n > new Date(o.graceUntil); o.canUse = !o.limited;
      o.periodEnd = o.graceUntil;
    }
    if (status === 'paused') {
      // 休会中に解約した人は、休会が明けても請求しない
      o.pausedUntil = p.pausedUntil; o.nextBill = p.cancelAt ? null : p.pausedUntil; o.periodEnd = p.pausedUntil;
      o.limited = true; o.canUse = false;
    }
    if (status === 'canceling' || status === 'ended' || (status === 'paused' && p.cancelAt)) {
      var ld = prevDay(o.periodEnd);
      if (ld < new Date(me().joinedAt)) ld = new Date(me().joinedAt);
      o.lastDay = ld.toISOString();
    }
    o.cancelEnd = cancelEndOf(status, o, b);
    o.cancelReasons = (p.cancelReasons || []).slice();
    o.canceledAt = p.canceledAt || null;
    o.banner = planBanner(o);
    return o;
  }
  /** いま解約したら、いつ終わるか（解約の確認・unusedSummary・cancelPlan で同じ日にする）。
      有効：次の請求日／支払いエラー：次の請求日（払えていない月の終わり）／休会中：休会が明ける日（休会のまま終わる） */
  function cancelEndOf(status, o, b) {
    if (status === 'active') return o.nextBill;
    if (status === 'past_due') return b.next.toISOString();
    if (status === 'paused') return o.pausedUntil;
    return o.periodEnd;
  }
  /** 全画面に出す帯（支払いエラー・休会中・終了） */
  function planBanner(o) {
    o = o || plan();
    // 支払いエラーのまま解約した人も、猶予のあいだ・猶予切れで同じ帯（カードを更新すれば払える。解約はそのまま）
    if (o.status === 'past_due' || (o.status === 'canceling' && o.failedAt)) {
      return o.limited
        ? { kind: 'warn', text: 'お支払いが確認できないため、講座とイベントを止めています。カードを更新すると、すぐに戻ります', href: '#/account?focus=card', action: 'カードを更新する' }
        : { kind: 'warn', text: 'お支払いができませんでした。' + jpDate(o.graceUntil) + 'までにカードを更新してください', href: '#/account?focus=card', action: 'カードを更新する' };
    }
    if (o.status === 'paused') {
      return o.cancelAt
        ? { kind: 'info', text: '休会中です。解約の手続きが済んでいるので、' + jpDate(o.lastDay || o.cancelAt) + 'で会員期間が終わります', href: '#/account?focus=plan', action: 'アカウントを見る' }
        : { kind: 'info', text: '休会中です（' + jpDate(o.pausedUntil) + 'から再開）', href: '#/account?focus=plan', action: '休会をやめる' };
    }
    if (o.status === 'ended') return { kind: 'end', text: '会員期間は' + jpDate(o.lastDay) + 'で終わりました', href: o.rejoin.href, action: '再入会する' };
    return null;
  }
  /* 見られる画面：終了したら支払いの記録とヘルプだけ。猶予切れ・休会中は講座などを止める */
  /* 会員証は終了しても開ける（「会員期間終了」の面を出す。QR・お店で見せるは出さない。card.js） */
  var GATE = { ended: ['account', 'help', 'notices', 'card'], limited: ['home', 'account', 'messages', 'help', 'notices', 'start', 'card'] };
  function planGate(route) {
    var p = plan();
    if (p.status === 'ended') return { ok: GATE.ended.indexOf(route) >= 0, reason: 'ended', plan: p };
    if (p.limited) return { ok: GATE.limited.indexOf(route) >= 0, reason: 'limited', plan: p };
    return { ok: true, reason: null, plan: p };
  }
  function invoices(opt) {
    var list = S().invoices.slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    if (opt && opt.upcoming) {
      var p = plan();
      if (p.nextBill && p.status === 'active') list.unshift({ id: 'upcoming', at: p.nextBill, amount: p.price, status: 'upcoming' });
    }
    return list;
  }
  /** 解約する。opt.reasons（解約の理由。画面で選んだもの）は運営画面の集計のために残す */
  function cancelPlan(opt) {
    opt = opt || {};
    var p = plan();
    if (p.status === 'ended' || p.status === 'canceling' || (p.status === 'paused' && p.cancelAt)) return p;
    var reasons = (Array.isArray(opt.reasons) ? opt.reasons : []).map(str).filter(Boolean).slice(0, 10);
    var at = p.cancelEnd, when = nowIso();
    update(function (s) {
      var base = { cancelAt: at, graceUntil: null, endedAt: null, pausedUntil: null, cancelReasons: reasons, canceledAt: when };
      // 休会中：休会のまま、明ける日で終わる（使っていない期間に使えるようにはしない）
      if (p.status === 'paused') s.plan = Object.assign({}, s.plan, base, { status: 'paused', pausedUntil: p.pausedUntil });
      // 支払いエラー：次の請求日で終わる。猶予が過ぎたら止めるのは今までどおり
      else if (p.status === 'past_due') s.plan = Object.assign(base, { status: 'canceling', failedAt: p.failedAt, graceUntil: p.graceUntil });
      else s.plan = Object.assign(base, { status: 'canceling' });
    });
    return plan();
  }
  /** 払えていない請求があるか（支払いエラーのまま解約した人を、取り消したら支払いエラーに戻すため） */
  function unpaid(s) { return (s.invoices || []).some(function (i) { return i.status === 'failed'; }); }
  /** 解約を取り消す。支払いエラーのまま解約した人は、払えていない請求が残っていれば支払いエラー（同じ猶予）に戻す */
  function resumePlan() {
    var p = plan();
    if (p.status !== 'canceling') return p;
    update(function (s) {
      var was = s.plan || {};
      s.plan = was.failedAt && unpaid(s)
        ? { status: 'past_due', cancelAt: null, failedAt: was.failedAt, graceUntil: was.graceUntil || null, endedAt: null, pausedUntil: null }
        : { status: 'active', cancelAt: null, graceUntil: null, endedAt: null, pausedUntil: null };
    });
    return plan();
  }
  /** 休会（決定事項：画面は作るが既定では出さない。SITE.allowPause が true のときだけ動く） */
  function pausePlan(months) {
    if (!DATA.SITE.allowPause) return null;
    var p = plan();
    if (p.status !== 'active') return null;
    var until = addMonths(p.nextBill, Math.max(1, Math.min(3, +months || 1))).toISOString();
    update(function (s) { s.plan = { status: 'paused', cancelAt: null, graceUntil: null, endedAt: null, pausedUntil: until, pausedAt: nowIso() }; s.pause = { at: nowIso(), until: until }; });
    return plan();
  }
  /* 休会をやめるのは、休会を受け付けていない設定（allowPause:false）でもできる。
     試作版バーや運営画面の「休会にする」で休会になった人が、戻れなくならないように */
  function resumePause() {
    if (plan().status !== 'paused') return null;
    update(function (s) { s.plan = { status: 'active', cancelAt: null, graceUntil: null, endedAt: null, pausedUntil: null }; s.pause = null; });
    return plan();
  }
  /** Stripe の画面から戻ったことにする。支払いエラーなら、その場で払い直して有効に戻す。
      支払いエラーのまま解約した人（解約予定＋failedAt）も払い直す。解約はそのまま（解約予定の日で終わる） */
  function updateCard(card) {
    var cur = me().card || '';
    var next = card && typeof card === 'object' ? str(card.brand || 'Visa') + ' •••• ' + String(card.last4 || '').slice(-4) : str(card);
    if (!next || /•••• $/.test(next)) next = /4242/.test(cur) ? 'Mastercard •••• 5454' : 'Visa •••• 4242';
    var p = plan(), pastDue = p.status === 'past_due', canceling = p.status === 'canceling' && !!p.failedAt, was = pastDue || canceling;
    update(function (s) {
      s.me.card = next;
      if (!was) return;
      s.invoices.forEach(function (i) { if (i.status === 'failed') { i.status = 'paid'; i.paidAt = nowIso(); } });
      if (pastDue) s.plan = { status: 'active', cancelAt: null, graceUntil: null, endedAt: null, pausedUntil: null };
      else { s.plan = Object.assign({}, s.plan); delete s.plan.failedAt; s.plan.graceUntil = null; }
    });
    return { ok: true, card: next, recovered: was, plan: plan() };
  }
  /** 運営画面から：支払済の請求を返金にする（金額を省けば全額）。紹介報酬の取消は運営画面の側でする */
  function refundInvoice(invoiceId, amount, reason) {
    var inv = byId(S().invoices, invoiceId);
    if (!inv) return { ok: false, error: '請求が見つかりません' };
    if (inv.status !== 'paid') return { ok: false, error: inv.status === 'refunded' ? 'すでに返金しています' : '支払済の請求だけ返金できます' };
    var n = amount == null || amount === '' ? inv.amount : parseInt(String(amount).replace(/[^\d]/g, ''), 10);
    if (!(n >= 1 && n <= inv.amount)) return { ok: false, error: '返金の額は1〜' + Number(inv.amount).toLocaleString('ja-JP') + '円で入れてください' };
    reason = str(reason);
    if (!reason) return { ok: false, error: '返金の理由を入れてください' };
    update(function (s) {
      var x = byId(s.invoices, invoiceId);
      x.status = 'refunded'; x.refund = { at: nowIso(), amount: n, reason: reason };
      addNotice(s, 'billing', (new Date(x.at).getMonth() + 1) + '月分の会費を' + Number(n).toLocaleString('ja-JP') + '円返金しました（カードへの返金は数日かかります）', '#/account?focus=invoices');
    });
    return { ok: true, invoice: byId(S().invoices, invoiceId) };
  }
  /** 試作版バーの「契約の状態」。デモ用の請求の行（demo:true）は切り替えるたびに消す */
  function setPlanDemo(status, opt) {
    opt = opt || {};
    if (!PLAN_LABELS[status]) return plan();
    var b = bills(), n = now(), SITE = DATA.SITE;
    update(function (s) {
      s.invoices = (s.invoices || []).filter(function (i) { return !i.demo; });
      s.plan = { status: 'active', cancelAt: null, graceUntil: null, endedAt: null, pausedUntil: null };
      s.pause = null;
      if (status === 'canceling') s.plan = { status: 'canceling', cancelAt: b.next.toISOString(), graceUntil: null, endedAt: null, pausedUntil: null };
      if (status === 'ended') {
        var end = b.last > new Date(s.me.joinedAt) ? b.last : new Date(n.getTime() - MIN);
        s.plan = { status: 'ended', cancelAt: end.toISOString(), endedAt: end.toISOString(), graceUntil: null, pausedUntil: null };
      }
      if (status === 'past_due') {
        // 決済に失敗した日：直近の請求日が猶予の中ならその日、そうでなければ2日前にしておく（猶予の残りが見えるように）
        var failed = (n - b.last) / DAY < (SITE.graceDays || 7) - 1 ? b.last : plusDays(n, -2);
        if (opt.expired) failed = plusDays(n, -((SITE.graceDays || 7) + 2));
        var grace = endOfDay(plusDays(failed, SITE.graceDays || 7));
        s.plan = { status: 'past_due', cancelAt: null, failedAt: new Date(failed).toISOString(), graceUntil: grace.toISOString(), endedAt: null, pausedUntil: null };
        s.invoices.push({ id: 'in_' + s.me.id + '_fail', at: new Date(failed).toISOString(), amount: SITE.price, status: 'failed', demo: true });
      }
      if (status === 'paused') {
        var until = addMonths(b.next, 1).toISOString();
        s.plan = { status: 'paused', cancelAt: null, graceUntil: null, endedAt: null, pausedUntil: until, pausedAt: nowIso() };
        s.pause = { at: nowIso(), until: until };
      }
    });
    return plan();
  }
  /** 解約前に見せる「まだ使っていないもの」。イベントは会員期間の終わりまでに開かれるものだけ */
  function unusedSummary() {
    // 数えるのは「いま解約したら終わる日」まで（cancelPlan と同じ日。支払いエラー中も猶予ではなく次の請求日）
    var p = plan(), end = new Date(p.cancelEnd || (p.status === 'active' ? p.nextBill : p.periodEnd));
    var open = DATA.COURSES.filter(function (c) { var st = courseState(c); return !st.locked && !st.completed; });
    var ev = upcoming().filter(function (e) { return new Date(e.at) < end; });
    return {
      courses: open.length,
      // まだ見ていない回だけの分数
      minutes: open.reduce(function (a, c) { return a + courseState(c).left; }, 0),
      events: ev.length, eventsUntil: prevDay(end).toISOString(),
      eventList: ev.slice(0, 5).map(function (e) { return { id: e.id, title: e.title, at: e.at }; }),
      referralMonthly: referral().monthly,
      perks: DATA.PERKS.length
    };
  }

  /* ---------- 運営画面から書くもの ----------
     管理画面のタブが呼ぶ。保存先は同じなので、会員のタブは storage のイベントで描き直る */
  function staffReply(text, from) {
    text = str(text);
    if (!text) return null;
    var m = { from: from && DATA.PEOPLE[from] ? from : 'staff2', at: nowIso(), text: text };
    update(function (s) { s.thread.push(m); addNotice(s, 'reply', '運営から返信：' + head(text, 24), '#/messages'); });
    return m;
  }
  function reviewGig(id, decision, reason) {
    var g = myGigRaw(S(), id);
    if (!g) return { ok: false, error: '募集が見つかりません' };
    if (g.status !== 'review') return { ok: false, error: '確認中の募集ではありません' };
    reason = str(reason);
    if (decision === 'reject' && !reason) return { ok: false, errors: { reason: '差し戻す理由を入れてください' } };
    update(function (s) {
      var x = myGigRaw(s, id), h = slot(s, 'gigHistory', {});
      if (decision === 'approve') {
        x.status = 'open'; x.postedAt = nowIso(); x.isNew = true;
        h[id] = (h[id] || []).concat([{ at: nowIso(), text: '運営の確認が終わり、掲載しました' }]);
        addNotice(s, 'gig', '募集「' + x.title + '」を掲載しました', '#/gigs/' + id);
      } else {
        x.status = 'rejected'; x.rejectReason = reason;
        h[id] = (h[id] || []).concat([{ at: nowIso(), text: '差し戻し：' + reason }]);
        addNotice(s, 'gig', '募集「' + x.title + '」が差し戻されました', '#/gigs/' + id);
      }
    });
    return { ok: true, gig: byId(myGigs(), id) };
  }
  function markAnswer(commentId) {
    var f = findComment(commentId);
    if (!f) return null;
    var p = findRawPost(f.postId);
    if (!p || p.kind !== 'question') return null;
    if (f.c.answer || (S().answerMarks || {})[commentId]) return null;
    var mine = f.source === 'me' || isMe(f.c.by), who = person(mine ? 'me' : f.c.by), ru = rule('answer');
    update(function (s) {
      if (f.source === 'me') byId(s.comments, commentId).answer = true;
      else slot(s, 'answerMarks', {})[commentId] = nowIso();
      if (mine) {
        s.pointsLog.push({ at: nowIso(), pt: ru.pt, rule: 'answer', why: '質問に答えた（' + person(p.by).name + 'さん「' + head(p.text) + '」）', link: '#/feed/' + p.id + '?c=' + commentId });
        addNotice(s, 'comment', 'あなたのコメントが回答に選ばれました（+' + ru.pt + 'pt）', '#/feed/' + p.id + '?c=' + commentId);
      }
    });
    return { ok: true, to: who, pt: who.staff ? 0 : ru.pt };
  }
  function simulateThanks(commentId, personId) {
    var f = findComment(commentId);
    if (!f || f.source !== 'me') return null;
    var from = personId && DATA.PEOPLE[personId] && !DATA.PEOPLE[personId].staff ? personId : 'm12';
    if ((f.c.thanksFrom || []).indexOf(from) >= 0) return null;
    var ru = rule('thanks'), name = person(from).name;
    update(function (s) {
      var c = byId(s.comments, commentId);
      c.thanksFrom = (c.thanksFrom || []).concat([from]); c.thanks = (c.thanks || 0) + 1;
      s.pointsLog.push({ at: nowIso(), pt: ru.pt, rule: 'thanks', why: 'コメントに「ありがとう」をもらった（' + name + 'さんから）', link: '#/feed/' + c.postId + '?c=' + commentId });
      addNotice(s, 'thanks', name + 'さんがあなたのコメントに「ありがとう」', '#/feed/' + c.postId + '?c=' + commentId);
    });
    return { ok: true, pt: ru.pt };
  }
  function grantPoints(personId, ruleId, why, link) {
    var ru = byId(DATA.POINT_RULES, ruleId);
    if (!ru) return { ok: false, error: 'ポイントのルールを選んでください' };
    var pp = DATA.PEOPLE[personId];
    if (pp && pp.staff) return { ok: false, error: '運営・講師にはポイントを付けません' };
    why = str(why) || ru.name;
    var e = { id: uid('pg'), at: nowIso(), pt: ru.pt, rule: ru.id, why: why, link: link || '', by: 'staff' };
    update(function (s) {
      if (isMe(personId)) {
        s.pointsLog.push(e);
        addNotice(s, 'points', '貢献ポイント +' + ru.pt + 'pt（' + why + '）', '#/ranking');
      } else slot(s, 'pointGrants', []).push(Object.assign({ person: personId }, e));
    });
    return { ok: true, entry: e };
  }
  function revokePoints(entryId, why) {
    var s = S(), idx = -1;
    (s.pointsLog || []).forEach(function (l, i) { if (l.id === entryId || 'pl-' + i === entryId) idx = i; });
    var g = byId(s.pointGrants, entryId);
    if (idx < 0 && !g) return { ok: false, error: '記録が見つかりません' };
    update(function (st) {
      var x = idx >= 0 ? st.pointsLog[idx] : byId(st.pointGrants, entryId);
      x.revoked = true; x.revokedAt = nowIso(); x.revokeWhy = str(why);
    });
    return { ok: true };
  }
  function confirmReward(rowId) {
    var row = byId(rewardRows(), rowId);
    if (!row) return { ok: false, error: '明細が見つかりません' };
    if (row.status === 'void') return { ok: false, error: '取消の明細です' };
    if (row.status === 'hold') return { ok: false, error: '初回決済から' + DATA.REFERRAL.holdDays + '日たっていません（' + md(row.confirmAt) + 'から確定できます）' };
    if (row.status === 'scheduled') return { ok: false, error: 'すでに支払予定です' };
    if (row.confirmedBy || row.status === 'paid') return { ok: false, error: 'すでに確定しています' };
    update(function (s) {
      slot(s, 'rewardStatus', {})[rowId] = { status: 'confirmed', at: nowIso() };
      addNotice(s, 'reward_confirmed', '紹介報酬（' + Number(row.amount).toLocaleString('ja-JP') + '円）が確定しました', '#/referral');
    });
    return { ok: true, row: byId(rewardRows(), rowId) };
  }
  /** 月末の締め：確定の行を支払予定にする。お知らせは運営画面が publishNotice でまとめて出す */
  function scheduleReward(rowId, opt) {
    opt = opt || {};
    var row = byId(rewardRows(), rowId);
    if (!row) return { ok: false, error: '明細が見つかりません' };
    if (row.status === 'void') return { ok: false, error: '取消の明細です' };
    if (row.status === 'hold') return { ok: false, error: '保留中の明細は締められません（' + md(row.confirmAt) + 'に確定します）' };
    if (row.status === 'paid') return { ok: false, error: '支払い済みです' };
    var payAt = valid(opt.payAt) ? new Date(opt.payAt).toISOString() : null;
    update(function (s) {
      var o = { status: 'scheduled', at: nowIso() };
      if (payAt) o.payAt = payAt;
      slot(s, 'rewardStatus', {})[rowId] = o;
    });
    return { ok: true, row: byId(rewardRows(), rowId) };
  }
  function payReward(rowId) {
    var row = byId(rewardRows(), rowId);
    if (!row) return { ok: false, error: '明細が見つかりません' };
    if (row.status !== 'confirmed' && row.status !== 'scheduled') return { ok: false, error: row.status === 'paid' ? '支払い済みです' : '確定した明細だけ支払えます' };
    if (!S().bank) return { ok: false, error: '振込先が登録されていません' };
    update(function (s) { slot(s, 'rewardStatus', {})[rowId] = { status: 'paid', at: nowIso() }; });
    return { ok: true, row: byId(rewardRows(), rowId) };
  }
  /* 月末の締めと支払い（運営画面の紹介報酬）。ym は 'YYYY-MM'（省略で今月） */
  function ymOf(ym) {
    if (ym == null || ym === '') { var n = now(); return { y: n.getFullYear(), m: n.getMonth() }; }
    var m = /^(\d{4})-(\d{1,2})$/.exec(str(ym));
    return m && +m[2] >= 1 && +m[2] <= 12 ? { y: +m[1], m: +m[2] - 1 } : null;
  }
  function ymKey(d) { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function yenText(n) { return Number(n || 0).toLocaleString('ja-JP') + '円'; }
  /** 月末の締め：その月の末までに確定した明細（確定のもの）を、まとめて支払予定にする。
      opt.payAt で支払日を決められる（省略で翌月の支払日）。opt.notice が true なら会員にお知らせ（運営画面が publishNotice で出すなら false のまま）
      → { ok, ym, payAt, count, amount, rows[行id] } / { ok:false, error } */
  function closeMonth(ym, opt) {
    opt = opt || {};
    var p = ymOf(ym);
    if (!p) return { ok: false, error: '締める月は「2026-09」の形で入れてください' };
    var closing = new Date(p.y, p.m + 1, 0, 23, 59), key = p.y + '-' + pad(p.m + 1);
    var payAt = valid(opt.payAt) ? new Date(opt.payAt) : payDateAfter(closing);
    var rows = rewardRows().filter(function (r) { return r.status === 'confirmed' && new Date(r.confirmAt) <= closing; });
    if (!rows.length) return { ok: false, error: '締める明細がありません（確定した明細だけ締められます）' };
    var amount = rows.reduce(function (a, r) { return a + r.amount; }, 0);
    update(function (s) {
      var st = slot(s, 'rewardStatus', {});
      rows.forEach(function (r) { st[r.id] = { status: 'scheduled', at: nowIso(), payAt: payAt.toISOString(), ym: key }; });
      if (opt.notice) addNotice(s, 'reward_confirmed', (p.m + 1) + '月分の紹介報酬 ' + yenText(amount) + 'を' + jpDate(payAt) + 'に振り込みます', '#/referral');
    });
    return { ok: true, ym: key, payAt: payAt.toISOString(), count: rows.length, amount: amount, rows: rows.map(function (r) { return r.id; }) };
  }
  /** 支払い：その月に締めた（支払予定の）明細を支払済にする。振込先がない・最低額に届かないときは払わない（翌月に繰り越し）。
      → { ok, ym, count, amount, rows[行id] } / { ok:false, error, carried?[行id] } */
  function payMonth(ym, opt) {
    opt = opt || {};
    var p = ymOf(ym);
    if (!p) return { ok: false, error: '支払う月は「2026-09」の形で入れてください' };
    var key = p.y + '-' + pad(p.m + 1), ov = S().rewardStatus || {};
    var rows = rewardRows().filter(function (r) {
      if (r.status !== 'scheduled') return false;
      var o = ov[r.id];
      return o && o.ym ? o.ym === key : ymKey(r.confirmAt) === key;
    });
    if (!rows.length) return { ok: false, error: '支払予定の明細がありません（先に締めてください）' };
    var ids = rows.map(function (r) { return r.id; }), amount = rows.reduce(function (a, r) { return a + r.amount; }, 0);
    // 振込先がないときは、明細の側が支払日を過ぎても支払済にしない（rewardRows が次の支払日へ繰り越す）ので、記録は書かない
    if (!S().bank) return { ok: false, error: '振込先が登録されていません', carried: ids };
    if (amount < (DATA.REFERRAL.minPayout || 0)) {
      // 最低額に届かない：翌月の締めに回す（支払日を翌月に。紹介の画面にも「繰り越し」と出る）
      var nxt = new Date(p.y, p.m + 1, 1), nk = ymKey(nxt), note = yenText(DATA.REFERRAL.minPayout) + '未満のため、翌月に繰り越し';
      update(function (s) {
        var st = slot(s, 'rewardStatus', {});
        rows.forEach(function (r) {
          var o = st[r.id] || {}, base = valid(o.payAt) ? new Date(o.payAt) : new Date(r.payAt);
          st[r.id] = { status: 'scheduled', at: o.at || nowIso(), payAt: refPayIn(base.getFullYear(), base.getMonth() + 1).toISOString(), ym: nk, note: note };
        });
      });
      return { ok: false, error: yenText(DATA.REFERRAL.minPayout) + '未満なので翌月に繰り越します', carried: ids, ym: nk };
    }
    update(function (s) {
      var st = slot(s, 'rewardStatus', {}), at = nowIso();
      rows.forEach(function (r) { st[r.id] = { status: 'paid', at: at, ym: key }; });
      if (opt.notice) addNotice(s, 'reward_confirmed', (p.m + 1) + '月分の紹介報酬 ' + yenText(amount) + 'を振り込みました', '#/referral');
    });
    return { ok: true, ym: key, count: rows.length, amount: amount, rows: ids };
  }
  /** 出欠を付ける。この画面の会員（自分）の分だけ state に入る。ほかの会員の分は運営画面の記録に */
  function markAttendance(eventId, personId) {
    if (personId && !isMe(personId)) return { ok: true, xp: 0, other: true };
    return attend(eventId);
  }
  function targetMatches(t) {
    t = str(t) || 'all';
    if (t === 'all') return true;
    if (t === 'new30') return day() <= 30;
    var m;
    if ((m = /^cohort:(\d{4}-\d{2})$/.exec(t))) return cohortKey(me().joinedAt) === m[1];
    if (/入会$/.test(t)) return cohort() === t;
    if ((m = /^lv(>=)?:?(\d)$/.exec(t))) return m[1] ? level().lv >= +m[2] : level().lv === +m[2];
    if ((m = /^member:(.+)$/.exec(t))) return me().id === m[1];
    return false;
  }
  function publishNotice(o) {
    o = o || {};
    var text = str(o.text), link = str(o.link);
    if (!text) return { ok: false, errors: { text: '本文を入れてください' } };
    if (text.length > 120) return { ok: false, errors: { text: '120文字までにしてください' } };
    if (link && !/^#\//.test(link)) return { ok: false, errors: { link: 'リンクは会員ページの中（#/…）だけにしてください' } };
    var hit = matchesTargetSafe(o.target);
    if (hit) update(function (s) { addNotice(s, o.type && NOTICE_ICON[o.type] ? o.type : 'system', text, link); });
    return { ok: true, delivered: hit };
  }
  function matchesTargetSafe(t) { try { return targetMatches(t); } catch (e) { return false; } }
  function approveEventProposal(id, approve, reason) {
    var p = byId(S().proposals, id);
    if (!p) return { ok: false, error: '申込みが見つかりません' };
    var ok = approve !== false;
    update(function (s) {
      var x = byId(s.proposals, id);
      x.status = ok ? 'approved' : 'rejected'; x.decidedAt = nowIso(); if (!ok) x.reason = str(reason);
      var what = x.kind === 'speaker' ? '成果発表会の発表' : '企画「' + x.title + '」';
      addNotice(s, 'system', what + (ok ? 'が決まりました' : 'は今回は見送りになりました'), x.kind === 'speaker' ? '#/events/' + x.event : '#/events');
    });
    return { ok: true, proposal: shapeProposal(byId(S().proposals, id)) };
  }
  function setMemberStatus(status) { return setPlanDemo(status); }

  /* タイムラインの見回り（A2）：運営の投稿・隠す・通報の対応。会員のタブは storage のイベントで描き直る */
  var STAFF_POST_KINDS = { news: 1, 'new': 1, gig: 1, event: 1 };
  function addStaffPost(o) {
    o = o || {};
    var text = str(o.text), link = str(o.link);
    if (!text) return { ok: false, errors: { text: '本文を入れてください' } };
    if (text.length > 500) return { ok: false, errors: { text: '500文字までにしてください' } };
    if (link && !/^#\//.test(link)) return { ok: false, errors: { link: 'リンクは会員ページの中（#/…）だけにしてください' } };
    var by = o.by && DATA.PEOPLE[o.by] && DATA.PEOPLE[o.by].staff ? o.by : 'staff2';
    var p = { id: str(o.id) || uid('sp'), kind: STAFF_POST_KINDS[o.kind] ? o.kind : 'news', by: by, text: text,
      at: valid(o.at) ? new Date(o.at).toISOString() : nowIso(), likes: 0, comments: 0, replies: [] };
    if (link) p.link = link;
    if (o.pinned) p.pinned = true;
    if (findRawPost(p.id)) return { ok: false, error: '同じ id の投稿があります' };
    update(function (s) { slot(s, 'staffPosts', []).push(p); if (s.pins) delete s.pins[p.id]; });
    return { ok: true, post: p };
  }
  /** 運営の投稿を直す（公開の前・後どちらでも）。patch に書いた欄だけ変える：text・link・kind・at（予約の時刻）・pinned */
  function updateStaffPost(id, patch) {
    patch = patch || {};
    var p0 = byId(S().staffPosts || [], str(id));
    if (!p0) return { ok: false, error: '運営の投稿が見つかりません' };
    var e = {}, next = {};
    if (patch.text !== undefined) {
      var text = str(patch.text);
      if (!text) e.text = '本文を入れてください'; else if (text.length > 500) e.text = '500文字までにしてください'; else next.text = text;
    }
    if (patch.link !== undefined) {
      var link = str(patch.link);
      if (link && !/^#\//.test(link)) e.link = 'リンクは会員ページの中（#/…）だけにしてください'; else next.link = link;
    }
    if (patch.kind !== undefined) { if (STAFF_POST_KINDS[patch.kind]) next.kind = patch.kind; else e.kind = '種類を選んでください'; }
    if (patch.at !== undefined) { if (valid(patch.at)) next.at = new Date(patch.at).toISOString(); else e.at = '日時を正しく入れてください'; }
    if (keys(e).length) return { ok: false, errors: e };
    update(function (s) {
      var x = byId(s.staffPosts, p0.id);
      Object.assign(x, next);
      if (next.link === '') delete x.link;
      if (patch.pinned !== undefined) {
        if (patch.pinned) x.pinned = true; else delete x.pinned;
        if (s.pins) delete s.pins[x.id];
      }
      x.editedAt = nowIso();
    });
    return { ok: true, post: byId(S().staffPosts, p0.id) };
  }
  /** 運営の投稿を取り下げる（公開のあと・予約のまま、どちらも。記録ごと消す） */
  function removeStaffPost(id) {
    id = str(id);
    if (!byId(S().staffPosts || [], id)) return { ok: false, error: '運営の投稿が見つかりません' };
    update(function (s) {
      s.staffPosts = s.staffPosts.filter(function (x) { return x.id !== id; });
      if (s.pins) delete s.pins[id];
      if (s.hiddenPosts) delete s.hiddenPosts[id];
    });
    return { ok: true };
  }
  /** 投稿を固定する・外す（data.js の投稿・会員の投稿・運営の投稿のどれでも）。タイムラインの先頭に並ぶ */
  function setPin(postId, on) {
    postId = str(postId);
    var p = findRawPost(postId);
    if (!p) return { ok: false, error: '投稿が見つかりません' };
    update(function (s) {
      var sp = byId(s.staffPosts || [], postId);
      if (sp) { if (on) sp.pinned = true; else delete sp.pinned; if (s.pins) delete s.pins[postId]; return; }
      // data.js で固定している投稿を外すときも印を残す（on:false）。元と同じになるなら印は消す
      var pins = slot(s, 'pins', {});
      if (!!p.pinned === !!on) delete pins[postId]; else pins[postId] = { on: !!on, at: nowIso() };
    });
    return { ok: true, pinned: !!on };
  }
  function pinPost(postId) { return setPin(postId, true); }
  function unpinPost(postId) { return setPin(postId, false); }
  /** 固定している投稿の id（公開の前の運営の投稿・隠した投稿も入る。運営画面の一覧で使う） */
  function pinnedPosts() {
    return rawPosts().filter(function (p) { return pinnedOf(p) && !S().deleted[p.id]; }).map(function (p) { return p.id; });
  }
  /** 運営が隠したことを書いた本人に知らせる（会員ページの会員の投稿・コメントのときだけ）。理由は短く添える */
  function tellAuthor(s, what, reason, link) {
    var why = head(str(reason), 20);
    addNotice(s, 'system', '運営が' + what + 'を非表示にしました' + (why ? '（' + why + '）' : ''), link);
  }
  function hidePost(postId, reason) {
    var p = findRawPost(postId);
    if (!p) return { ok: false, error: '投稿が見つかりません' };
    var mine = !!p.mine || isMe(p.by);
    update(function (s) {
      var was = (s.hiddenPosts || {})[postId];
      slot(s, 'hiddenPosts', {})[postId] = { at: nowIso(), reason: str(reason) };
      if (mine && !was) tellAuthor(s, 'あなたの投稿', reason, '#/feed/' + postId);
    });
    return { ok: true, notified: mine };
  }
  function unhidePost(postId) {
    if (!hiddenOf(postId)) return { ok: false, error: '隠している投稿ではありません' };
    update(function (s) { delete s.hiddenPosts[postId]; });
    return { ok: true };
  }
  /** コメントを隠す・戻す（隠したコメントは、書いた本人にだけ hidden つきで見える。本人にはお知らせ） */
  function hideComment(commentId, reason) {
    var f = findComment(commentId);
    if (!f) return { ok: false, error: 'コメントが見つかりません' };
    var mine = f.source === 'me' || isMe(f.c.by);
    update(function (s) {
      var was = (s.hiddenComments || {})[commentId];
      slot(s, 'hiddenComments', {})[commentId] = { at: nowIso(), reason: str(reason) };
      if (mine && !was) tellAuthor(s, 'あなたのコメント', reason, '#/feed/' + f.postId + '?c=' + commentId);
    });
    return { ok: true, notified: mine };
  }
  /** 運営のデモを最初に戻すとき：運営の投稿・固定・隠した投稿とコメントを消す（人を切り替えても残るものなので） */
  function resetStaffFeed() {
    update(function (s) { s.staffPosts = []; s.pins = {}; s.hiddenPosts = {}; s.hiddenComments = {}; });
    return { ok: true };
  }
  function unhideComment(commentId) {
    if (!(S().hiddenComments || {})[commentId]) return { ok: false, error: '隠しているコメントではありません' };
    update(function (s) { delete s.hiddenComments[commentId]; });
    return { ok: true };
  }
  /* 通報の対応。action は日本語の状態（受付/非表示/注意/対応不要）か、hide / warn / dismiss / open。
     非表示：通報された投稿（コメントの通報ならそのコメント）を隠す。受付に戻すと、この通報で隠したものは戻す。
     通報した会員には、対応が決まったときにお知らせが届く（書いた人の名前は出さない） */
  var REPORT_STATUS = { '受付': 1, '非表示': 1, '注意': 1, '対応不要': 1 };
  var REPORT_ACTIONS = { hide: '非表示', warn: '注意', dismiss: '対応不要', none: '対応不要', open: '受付', reopen: '受付' };
  var REPORT_DONE = { '非表示': '非表示にしました', '注意': '書いた人に運営から伝えました', '対応不要': 'ルールに反する内容は見つかりませんでした' };
  function resolveReport(reportId, action, reason) {
    var r = byId(S().reports, reportId);
    if (!r) return { ok: false, error: '通報が見つかりません' };
    var status = REPORT_STATUS[action] ? action : REPORT_ACTIONS[action];
    if (!status) return { ok: false, error: '対応を選んでください' };
    update(function (s) {
      var x = byId(s.reports, reportId), was = x.status, at = nowIso(), why = str(reason) || x.reason || '';
      x.status = status; x.doneAt = status === '受付' ? null : at;
      if (status === '非表示') {
        if (x.commentId) slot(s, 'hiddenComments', {})[x.commentId] = { at: at, reason: why, report: x.id };
        else slot(s, 'hiddenPosts', {})[x.postId] = { at: at, reason: why, report: x.id };
        // 通報されたのが会員ページの会員の投稿・コメントなら、本人にも知らせる（ふつうは自分の投稿は通報できないので起きない）
        var fc = x.commentId ? findComment(x.commentId) : null, fp = x.commentId ? null : findRawPost(x.postId);
        if (was !== '非表示' && fc && (fc.source === 'me' || isMe(fc.c.by))) tellAuthor(s, 'あなたのコメント', why, '#/feed/' + fc.postId + '?c=' + x.commentId);
        if (was !== '非表示' && fp && (fp.mine || isMe(fp.by))) tellAuthor(s, 'あなたの投稿', why, '#/feed/' + x.postId);
      } else if (was === '非表示') {
        var hc = s.hiddenComments || {}, hp = s.hiddenPosts || {};
        if (x.commentId && hc[x.commentId] && hc[x.commentId].report === x.id) delete hc[x.commentId];
        if (!x.commentId && hp[x.postId] && hp[x.postId].report === x.id) delete hp[x.postId];
      }
      if (status !== '受付' && was !== status) {
        addNotice(s, 'system', '通報した' + (x.commentId ? 'コメント' : '投稿') + 'を確認しました（' + REPORT_DONE[status] + '）',
          status === '非表示' ? '#/feed' : '#/feed/' + x.postId + (x.commentId ? '?c=' + x.commentId : ''));
      }
    });
    return { ok: true, report: byId(S().reports, reportId) };
  }

  /* ---------- 運営が直す中身（CMS） ----------
     運営画面の講座・回・録画・案件・福利厚生・イベント・お知らせの編集を、会員ページの保存（state.cms）に書く。
     store.js がそれを data.js の配列に重ねるので、開いている会員ページ・公開サイトにもすぐ出る（形は store.js の先頭）。 */
  var CMS_KINDS = ['faculty', 'course', 'lesson', 'archive', 'gig', 'perk', 'event', 'notice'];
  var CMS_PUBLISH = { published: 1, draft: 1, hidden: 1, scheduled: 1 };
  var CMS_PREFIX = { faculty: 'fc-', course: 'cs-', lesson: 'ls-', archive: 'ar-', gig: 'g-', perk: 'pk-', event: 'ev-', notice: 'nt-' };
  var CMS_LABEL = { faculty: '学部', course: '講座', lesson: '回', archive: '録画', gig: '案件', perk: '福利厚生', event: 'イベント', notice: 'お知らせ' };
  /* 種類ごとの欄：[型, 最大の長さ] 型：s 文字 / n 数 / b 真偽 / d 日時 / a 配列 / o 物（そのまま） / enum は値の一覧 */
  var CMS_FIELDS = {
    faculty: { name: ['s', 20], desc: ['s', 60], img: ['img'], alt: ['s', 80] },
    course: { title: ['s', 40], faculty: ['fac'], level: ['lv'], teacher: ['staff'], summary: ['s', 200], img: ['img'], alt: ['s', 80], learn: ['a'], quiz: ['quiz'] },
    lesson: { course: ['course'], title: ['s', 40], min: ['n', 1, 90], desc: ['s', 300], points: ['a'], material: ['material'], video: ['s', 20], newAt: ['d'] },
    archive: { title: ['s', 60], faculty: ['fac', 'showcase'], date: ['d'], min: ['n', 1, 300], teacher: ['staff'], desc: ['s', 300], chapters: ['a'], files: ['a'], course: ['course', true] },
    gig: { type: [['small', 'work', 'refer', 'peer']], title: ['s', 60], reward: ['s', 60], rewardType: [['shot', 'stock']], level: ['lv'], time: ['s', 60],
      remote: ['b'], place: ['s', 60], slots: ['s', 20], by: ['person'], requires: ['course', true], desc: ['s', 1000], steps: ['a'], closesAt: ['d', true], postedAt: ['d'],
      status: [['open', 'closed']], closedAt: ['d'], filled: ['n', 0, 999] },
    perk: { cat: ['s', 20], title: ['s', 60], desc: ['s', 300], how: ['s', 60], howType: [['', 'code', 'card', 'site', 'account']], example: ['s', 100], area: ['s', 60], until: ['s', 10], partner: ['s', 40], note: ['s', 60] },
    event: { kind: [['online', 'offline', 'showcase']], series: ['s', 20], title: ['s', 60], at: ['d'], min: ['n', 10, 600], place: ['s', 60], cap: ['n', 1, 1000],
      count: ['n', 0, 1000], fee: ['s', 40], host: ['host'], desc: ['s', 500], agenda: ['a'], img: ['img'], alt: ['s', 80], audience: [['', 'new30']],
      recording: ['b'], venue: ['o'], venues: ['a'], zoomUrl: ['s', 200] },
    notice: { text: ['s', 120], link: ['link'], type: ['s', 30], target: ['s', 40] }
  };
  var CMS_NEEDS = { faculty: ['name'], course: ['title', 'faculty'], lesson: ['title', 'course'], archive: ['title', 'date', 'faculty'], gig: ['title', 'type', 'reward'],
    perk: ['title', 'cat'], event: ['title', 'at'], notice: ['text'] };
  function cmsState() { var c = S().cms; return c && c.items ? c : { items: {}, order: {} }; }
  function cmsRec(kind, id) { return ((cmsState().items || {})[kind] || {})[id] || null; }
  function cmsBaseItem(kind, id) {
    if (kind === 'notice') return byId(CLG.store.cmsBase('notice'), id) || (/^f\d+$/.test(id) ? { id: id } : null);
    return byId(CLG.store.cmsBase(kind), id);
  }
  function cmsExists(kind, id) { var r = cmsRec(kind, id); return !!cmsBaseItem(kind, id) || !!(r && !r.removed); }
  function cmsVisible(r) {
    if (!r) return true;
    if (r.removed) return false;
    var p = r.publish || 'published';
    return p === 'published' || (p === 'scheduled' && !!r.publishAt && new Date(r.publishAt) <= now());
  }
  function cmsTouch(c) { c.savedAt = nowIso(); c.rev = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  /** 1つの欄を確かめて直す。→ { v } か { e: 文 } */
  function cmsField(kind, k, v, spec) {
    var t = spec[0];
    if (v === null) return { v: null };
    if (Array.isArray(t)) { v = v == null ? '' : String(v); return t.indexOf(v) >= 0 ? { v: v } : { e: '選べる値ではありません' }; }
    if (t === 's') { v = str(v); return v.length > spec[1] ? { e: spec[1] + '文字までにしてください' } : { v: v }; }
    if (t === 'n') { var n = Number(halfWidth(v)); return isFinite(n) && n >= spec[1] && n <= spec[2] ? { v: n } : { e: spec[1] + '〜' + spec[2] + 'で入れてください' }; }
    if (t === 'b') return { v: v === true || v === 'true' || v === '1' || v === 1 || v === 'on' };
    if (t === 'd') { if ((v === '' || v == null) && spec[1]) return { v: null }; return valid(v) ? { v: new Date(v).toISOString() } : { e: '日時を正しく入れてください' }; }
    if (t === 'a') return Array.isArray(v) ? { v: JSON.parse(JSON.stringify(v)).slice(0, 50) } : { e: '一覧の形で入れてください' };
    if (t === 'o') return v && typeof v === 'object' ? { v: JSON.parse(JSON.stringify(v)) } : { e: '形が正しくありません' };
    if (t === 'lv') { var lv = parseInt(v, 10); return lv >= 1 && lv <= 6 ? { v: lv } : { e: 'レベルは1〜6で選んでください' }; }
    // 学部は data.js のものか、運営が足した学部（cmsUpsert('faculty')。下書きの学部の講座は会員には出ない）
    if (t === 'fac') { v = str(v); return byId(DATA.FACULTIES, v) || cmsExists('faculty', v) || (spec[1] && v === spec[1]) ? { v: v } : { e: '学部を選んでください' }; }
    if (t === 'staff' || t === 'person') { v = str(v); var p = DATA.PEOPLE[v]; return p && (t === 'person' || p.staff) ? { v: v } : { e: t === 'staff' ? '講師を選んでください' : '人を選んでください' }; }
    // 主催：PEOPLE の人か、名簿の会員番号（会員の企画から載せたイベント）
    if (t === 'host') { v = str(v); return DATA.PEOPLE[v] || (DATA.ROSTER_INDEX && DATA.ROSTER_INDEX[v]) || isMe(v) ? { v: v } : { e: '主催の人を選んでください' }; }
    if (t === 'course') { v = str(v); if (!v && spec[1]) return { v: '' }; return cmsExists('course', v) ? { v: v } : { e: '講座が見つかりません' }; }
    if (t === 'img') { v = str(v); return !v || /^assets\/img\/[\w\-./]+$/.test(v) || PHOTO_RE.test(v) ? { v: v } : { e: '画像は assets/img/ の中のものか、JPEG・PNG を選んでください' }; }
    if (t === 'link') { v = str(v); return !v || /^#\//.test(v) ? { v: v } : { e: 'リンクは会員ページの中（#/…）だけにしてください' }; }
    if (t === 'material') {
      if (!v) return { v: null };
      var name = str(v.name), type = str(v.type) || 'pdf';
      return name && name.length <= 60 ? { v: { name: name, type: type } } : { e: '資料の名前を60文字までで入れてください' };
    }
    if (t === 'quiz') {
      if (!Array.isArray(v)) return { e: '確認テストの形が正しくありません' };
      var ok = v.every(function (q) { return q && str(q.q) && Array.isArray(q.choices) && q.choices.length >= 2 && +q.answer >= 0 && +q.answer < q.choices.length; });
      return ok ? { v: v.slice(0, 5).map(function (q) { return { q: str(q.q), choices: q.choices.map(str), answer: +q.answer, why: str(q.why), lesson: q.lesson ? str(q.lesson) : undefined }; }) }
        : { e: '問い・選択肢（2つ以上）・答えを入れてください' };
    }
    return { v: v };
  }
  /** 運営画面から：足す・直す。obj.id が data.js か記録にあれば直す（欄を重ねる）、なければ足す（id は無ければ作る）。
      obj.publish（published/draft/hidden/scheduled）と publishAt で公開の状態。講座・回・録画・福利厚生・イベント・お知らせは status に書いてもよい。
      回は obj.course に講座の id（ほかの講座へ移すときも course を変える）。
      → { ok, id, item（重ねたあとの1件。下書きでも返す）, added } / { ok:false, errors:{欄: 文} } */
  function cmsUpsert(kind, obj) {
    if (CMS_KINDS.indexOf(kind) < 0) return { ok: false, error: '種類が正しくありません' };
    obj = obj || {};
    var id = str(obj.id), spec = CMS_FIELDS[kind], e = {}, patch = {};
    var base = id ? cmsBaseItem(kind, id) : null, prev = id ? cmsRec(kind, id) : null;
    var isNew = !base && !(prev && !prev.removed);
    keys(obj).forEach(function (k) {
      if (!spec[k]) return;
      var r = cmsField(kind, k, obj[k], spec[k]);
      if (r.e) e[k] = r.e; else if (r.v !== undefined) patch[k] = r.v;
    });
    var pub = obj.publish != null ? obj.publish : (kind !== 'gig' && CMS_PUBLISH[obj.status] ? obj.status : null);
    if (pub != null && !CMS_PUBLISH[pub]) e.publish = '公開の状態を選んでください';
    if (pub === 'scheduled' && !valid(obj.publishAt)) e.publishAt = '公開する日時を入れてください';
    if (isNew) (CMS_NEEDS[kind] || []).forEach(function (k) { if ((patch[k] == null || patch[k] === '') && !e[k]) e[k] = '入れてください'; });
    // 案件・イベント・お知らせは、会員の募集と同じ「載せられないもの」を確かめる
    if (kind === 'gig' || kind === 'event' || kind === 'notice') {
      ['text', 'title', 'desc', 'reward'].forEach(function (k) {
        var hit = patch[k] ? checkBanned(patch[k]) : [];
        if (hit.length && !e[k]) e[k] = 'この内容は載せられません（' + hit.join('・') + '）';
      });
    }
    if (keys(e).length) return { ok: false, errors: e };
    if (!id) id = CMS_PREFIX[kind] + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    update(function (s) {
      var c = slot(s, 'cms', { savedAt: null, items: {}, order: {} });
      if (!c.items || typeof c.items !== 'object') c.items = {};
      if (!c.order || typeof c.order !== 'object') c.order = {};
      var box = c.items[kind] = c.items[kind] || {};
      var rec = Object.assign({}, box[id] && !box[id].removed ? box[id] : {}, patch, { id: id, savedAt: nowIso(), added: !base });
      delete rec.removed;
      if (pub != null) rec.publish = pub;
      if (pub === 'scheduled') rec.publishAt = new Date(obj.publishAt).toISOString(); else if (pub != null) delete rec.publishAt;
      if (kind === 'notice' && rec.added && !rec.at) rec.at = nowIso();   // お知らせの時刻は出した時（直しても変えない）
      box[id] = rec;
      cmsTouch(c);
    });
    return { ok: true, id: id, item: cmsItem(kind, id), added: isNew };
  }
  /** 消す。data.js にあるものは「削除」の印（会員に見せない。cmsUpsert で戻せる）、足したものは記録ごと消す */
  function cmsRemove(kind, id) {
    if (CMS_KINDS.indexOf(kind) < 0) return { ok: false, error: '種類が正しくありません' };
    var base = cmsBaseItem(kind, id), rec = cmsRec(kind, id);
    if (!base && !rec) return { ok: false, error: CMS_LABEL[kind] + 'が見つかりません' };
    update(function (s) {
      var c = slot(s, 'cms', { savedAt: null, items: {}, order: {} }), box = (c.items[kind] = c.items[kind] || {});
      if (base) box[id] = Object.assign({}, box[id] || {}, { id: id, removed: nowIso(), savedAt: nowIso() });
      else delete box[id];
      cmsTouch(c);
    });
    return { ok: true };
  }
  /** 並べ直す。group は並びの単位（回は講座の id が要る。講座は学部、福利厚生は分類でもよい）。ids に書いたものどうしだけ入れ替わる */
  function cmsReorder(kind, ids, group) {
    if (CMS_KINDS.indexOf(kind) < 0) return { ok: false, error: '種類が正しくありません' };
    if (!Array.isArray(ids) || !ids.length) return { ok: false, error: '並びを入れてください' };
    if (kind === 'lesson' && !group) return { ok: false, error: '回を並べ直すときは講座を指定してください' };
    var name = kind + (group ? ':' + str(group) : '');
    update(function (s) {
      var c = slot(s, 'cms', { savedAt: null, items: {}, order: {} });
      if (!c.order || typeof c.order !== 'object') c.order = {};
      c.order[name] = ids.map(str).filter(Boolean).slice(0, 500);
      cmsTouch(c);
    });
    return { ok: true, order: name };
  }
  /** 運営画面の一覧：data.js の中身に記録を重ねたもの（下書き・非公開も入る。削除したものは opt.removed のときだけ）。
      各行に cms:{ publish, publishAt, visible, edited, added, removed } が付く。回は opt.course でしぼれる（各行に course が入る） */
  function cmsList(kind, opt) {
    opt = opt || {};
    if (CMS_KINDS.indexOf(kind) < 0) return [];
    var c = cmsState(), R0 = (c.items || {})[kind] || {}, base = CLG.store.cmsBase(kind), out = [];
    function row(b, r) {
      var o = Object.assign({}, b || {});
      keys(r || {}).forEach(function (k) { if (!{ publish: 1, publishAt: 1, removed: 1, added: 1, savedAt: 1 }[k]) o[k] = r[k]; });
      o.cms = { publish: (r && r.publish) || 'published', publishAt: (r && r.publishAt) || null, visible: cmsVisible(r),
        edited: !!r && !!b, added: !b, removed: !!(r && r.removed), savedAt: (r && r.savedAt) || null };
      delete o.lessons;
      return o;
    }
    base.forEach(function (b) { var r = R0[b.id]; if (r && r.removed && !opt.removed) return; out.push(row(b, r)); });
    keys(R0).forEach(function (id) { if (!byId(base, id) && !(R0[id].removed && !opt.removed)) out.push(row(null, R0[id])); });
    if (kind === 'lesson') {
      if (opt.course) out = out.filter(function (l) { return l.course === opt.course; });
      var groups = {};
      out.forEach(function (l) { (groups[l.course] = groups[l.course] || []).push(l); });
      out = [];
      keys(groups).forEach(function (cid) { out = out.concat(cmsOrdered(groups[cid], (c.order || {})['lesson:' + cid])); });
      return out;
    }
    var ord = c.order || {};
    if (ord[kind]) out = cmsOrdered(out, ord[kind]);
    keys(ord).forEach(function (k) { if (k.indexOf(kind + ':') === 0) out = cmsOrdered(out, ord[k]); });
    return out;
  }
  function cmsOrdered(list, ids) {
    if (!Array.isArray(ids) || !ids.length) return list;
    var slots = [], picked = [], map = {};
    list.forEach(function (x, i) { if (ids.indexOf(x.id) >= 0) { slots.push(i); map[x.id] = x; } });
    ids.forEach(function (id) { if (map[id] && picked.indexOf(map[id]) < 0) picked.push(map[id]); });
    var out = list.slice();
    slots.forEach(function (p, j) { out[p] = picked[j]; });
    return out;
  }
  /** 1件（cmsList の行と同じ形）か null */
  function cmsItem(kind, id) { return byId(cmsList(kind, { removed: true }), id); }
  /** 運営のデモを最初に戻すとき：直した中身を全部消す（data.js の中身に戻る） */
  function cmsReset() {
    update(function (s) { s.cms = { savedAt: null, items: {}, order: {} }; cmsTouch(s.cms); });
    return { ok: true };
  }

  CLG.rules = {
    // 会員・共通
    me: me, day: day, person: person, cohort: cohort, streak: streak, missingFields: missingFields,
    profile: profile, validateProfile: validateProfile, saveProfile: saveProfile,
    // 学び
    xp: xp, level: level, levelName: levelName, coursesAtLevel: coursesAtLevel,
    course: course, courseState: courseState, lessonState: lessonState, completeLesson: completeLesson,
    continueList: continueList, seeArchive: seeArchive, lessonPos: lessonPos, resumeText: resumeText, lessonNote: lessonNote, note: lessonNote,
    quiz: quiz, submitQuiz: submitQuiz, certificate: certificate, completedCount: completedCount,
    // スタートガイド・LINE・紹介コード
    steps: steps, onboarding: onboarding, syncSteps: syncSteps, completeStep: completeStep, setGoal: setGoal,
    lineLink: lineLink, startLineLink: startLineLink, finishLineLink: finishLineLink, unlinkLine: unlinkLine, linkLine: linkLine,
    validateRefCode: validateRefCode,
    // タイムライン・コメント
    feed: feed, post: post, toggleLike: toggleLike, addPost: addPost, introText: introText,
    imageLimit: imageLimit, validateImages: validateImages, editPost: editPost, deletePost: deletePost,
    REPORT_REASONS: REPORT_REASONS, reportPost: reportPost, mutePerson: mutePerson, unmutePerson: unmutePerson, mutes: mutes,
    comments: comments, commentCount: commentCount, addComment: addComment, deleteComment: deleteComment, thankComment: thankComment,
    // 名簿・検索
    members: members, membersFacets: membersFacets, memberProfile: memberProfile, search: search,
    // 案件・振込先
    gig: gig, gigLock: gigLock, GIG_LABELS: GIG_LABELS, gigState: gigState, gigDisclosure: gigDisclosure, applyGig: applyGig,
    withdrawGig: withdrawGig, gigEarnings: gigEarnings, gigHistory: gigHistory, gigReward: gigReward, checkBanned: checkBanned,
    validateGig: validateGig, createGig: createGig, editGig: editGig, myGigs: myGigs, closeGig: closeGig, applicants: applicants, acceptApplicant: acceptApplicant,
    declineApplicant: declineApplicant, submitWorkReport: submitWorkReport, workReports: workReports,
    gigThread: gigThread, sendGigMessage: sendGigMessage,
    validateBank: validateBank, setBank: setBank, bank: bank, removeBank: removeBank,
    // イベント
    event: event, isReserved: isReserved, isFull: isFull, attended: attended, eventOpen: eventOpen, reserve: reserve, unreserve: unreserve,
    upcoming: upcoming, myUpcoming: myUpcoming, attend: attend, joinWaitlist: joinWaitlist, leaveWaitlist: leaveWaitlist, waitlistPos: waitlistPos,
    eventAccess: eventAccess, todayEvents: todayEvents, attendees: attendees, proposeEvent: proposeEvent, applySpeaker: applySpeaker,
    speakerApp: speakerApp, proposals: proposals, memberEvents: memberEvents, pastReserved: pastReserved,
    // 紹介・ポイント
    referral: referral, rewardRows: rewardRows, points: points, ranking: ranking, rankTotal: rankTotal,
    // メッセージ・専門家
    thread: thread, unread: unread, markRead: markRead, sendMessage: sendMessage, adminOpen: adminOpen,
    meetingSlots: meetingSlots, setMeetingSlots: setMeetingSlots, meetingSlotConfig: meetingSlotConfig, bookMeeting: bookMeeting, meeting: meeting, meetings: meetings, cancelMeeting: cancelMeeting, confirmMeeting: confirmMeeting,
    EXPERT_STEPS: EXPERT_STEPS, requestExpert: requestExpert, expertRequests: expertRequests, advanceExpert: advanceExpert,
    // お知らせ・通知
    notices: notices, unreadNotices: unreadNotices, markNoticeRead: markNoticeRead, markAllNoticesRead: markAllNoticesRead,
    markNoticesRead: markAllNoticesRead, notifyPrefs: notifyPrefs, setNotifyPref: setNotifyPref,
    // アカウント・安全
    PASSWORD_RULE: PASSWORD_RULE, validateLoginId: validateLoginId, checkLogin: checkLogin, changePassword: changePassword,
    requestPasswordReset: requestPasswordReset, checkResetToken: checkResetToken, resetPassword: resetPassword, setPassword: setPassword,
    needsPassword: needsPassword, requestEmailChange: requestEmailChange, pendingEmail: pendingEmail, confirmEmailChange: confirmEmailChange,
    cancelEmailChange: cancelEmailChange, resendEmailChange: resendEmailChange, sessions: sessions, logoutOthers: logoutOthers, logoutSession: logoutSession,
    requestData: requestData, dataRequests: dataRequests, cancelDataRequest: cancelDataRequest, completeDataRequest: completeDataRequest,
    adminSuspension: adminSuspension, loginBlocked: loginBlocked, setLoginBlocked: setLoginBlocked,
    // 支払い
    PLAN_LABELS: PLAN_LABELS, plan: plan, planBanner: planBanner, planGate: planGate, invoices: invoices, cancelPlan: cancelPlan, resumePlan: resumePlan,
    pausePlan: pausePlan, resumePause: resumePause, updateCard: updateCard, setPlanDemo: setPlanDemo, rejoinLink: rejoinLink, unusedSummary: unusedSummary,
    refundInvoice: refundInvoice,
    // 運営画面から
    staffReply: staffReply, reviewGig: reviewGig, markAnswer: markAnswer, simulateThanks: simulateThanks,
    grantPoints: grantPoints, revokePoints: revokePoints, confirmReward: confirmReward, payReward: payReward, scheduleReward: scheduleReward,
    closeMonth: closeMonth, payMonth: payMonth, voidReward: voidReward,
    markAttendance: markAttendance, publishNotice: publishNotice, approveEventProposal: approveEventProposal, setMemberStatus: setMemberStatus,
    advanceGigApp: advanceGigApp, declineGigApp: declineGigApp, simulateApplicant: simulateApplicant, promoteWaitlist: promoteWaitlist,
    addStaffPost: addStaffPost, updateStaffPost: updateStaffPost, removeStaffPost: removeStaffPost, pinPost: pinPost, unpinPost: unpinPost, pinnedPosts: pinnedPosts,
    resetStaffFeed: resetStaffFeed, hidePost: hidePost, unhidePost: unhidePost, hideComment: hideComment, unhideComment: unhideComment,
    resolveReport: resolveReport, REPORT_ACTIONS: REPORT_ACTIONS,
    // 運営が直す中身（CMS）
    CMS_KINDS: CMS_KINDS, cmsUpsert: cmsUpsert, cmsRemove: cmsRemove, cmsReorder: cmsReorder, cmsList: cmsList, cmsItem: cmsItem, cmsReset: cmsReset
  };
})(window);
