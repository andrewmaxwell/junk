import java.awt.*;
import java.awt.event.*;

public class shoot extends java.applet.Applet implements MouseListener, MouseMotionListener, KeyListener {
	private static final long serialVersionUID = 1L;
	int width=800,height=580, extra=20, mouseX, mouseY, gunX=width/2, gunY=height/2, killLife=5, numColors=4, moreNum, projectileTime=40, starColor=(int)(Math.random()*numColors), health, maxHealth=100, rank;
	Image offscreen;
	Graphics2D g2;
	boolean mouseDown, menu=true, finished, shooting, clickedButton=false, begun=false, viewHighScores=false, gameOverScreen=false, sound=true;
	double objRad=25, 
	gravity=1000000, 
	shootSpeed=600, 
	bounce=0.5, 
	spinSpeed=20, 
	entry, 
	startingEntry=1,
	entryIncrement, 
	incrementSpeed=0.03, 
	waddleSpeed=0.75, 
	waddleSize=0.1, 
	gunAngle, 
	armAngle, 
	armSpeed=25.0, 
	maxSpeed=objRad*12.5, 
	frameRate=15, 
	killSpeed=50, 
	wallRepel=30, 
	friction=0.5, 
	maxFrameRate=50, 
	blastRad=objRad*10,
	newBombTimer;
	
	Color[] colors={Color.getHSBColor(0, 0, 0.25f), Color.getHSBColor(0.66f, 0.5f, 1), Color.white, Color.getHSBColor(0.9f, 0.5f, 1)};

	imgGraphic penguin=new imgGraphic((int)(objRad*2), -0.2, 0.2, 10, colors, 0.4, "7 -17920 6 461.0 347.0 484.0 351.0 503.0 362.0 474.0 371.0 443.0 372.0 423.0 353.0 ,-17920 6 349.0 347.0 326.0 351.0 307.0 362.0 336.0 371.0 367.0 372.0 387.0 353.0 ,-16777216 31 397.0 90.0 369.0 98.0 346.0 117.0 330.0 152.0 320.0 181.0 299.0 216.0 288.0 268.0 290.0 278.0 302.0 277.0 310.0 261.0 309.0 301.0 315.0 325.0 330.0 342.0 351.0 353.0 376.0 358.0 402.0 359.0 430.0 359.0 458.0 355.0 472.0 348.0 483.0 340.0 493.0 319.0 495.0 302.0 492.0 254.0 501.0 269.0 511.0 267.0 516.0 261.0 498.0 214.0 473.0 178.0 464.0 147.0 448.0 115.0 425.0 96.0 ,v 34 404.0 350.0 381.0 348.0 361.0 342.0 345.0 334.0 333.0 324.0 325.0 309.0 322.0 294.0 323.0 264.0 333.0 220.0 345.0 185.0 342.0 169.0 343.0 152.0 349.0 135.0 357.0 122.0 366.0 118.0 374.0 119.0 385.0 134.0 393.0 164.0 410.0 165.0 414.0 135.0 421.0 119.0 431.0 117.0 438.0 120.0 447.0 134.0 453.0 146.0 453.0 163.0 451.0 178.0 470.0 225.0 481.0 267.0 483.0 302.0 472.0 325.0 462.0 336.0 450.0 343.0 425.0 348.0 ,-17920 6 372.0 164.0 401.0 160.0 431.0 162.0 426.0 170.0 403.0 180.0 383.0 172.0 ,-16777216 3 421.0 156.0 434.0 156.0 427.0 146.0 ,-16777216 3 369.0 156.0 382.0 156.0 375.0 146.0 ,");
	graphic star=new graphic("3 -16777216 12 409.0 147.0 381.0 225.0 385.0 293.0 248.0 298.0 327.0 324.0 394.0 317.0 405.0 451.0 426.0 382.0 418.0 305.0 552.0 300.0 477.0 276.0 409.0 283.0 ,v 20 409.0 147.0 389.0 226.0 395.0 295.0 307.0 279.0 221.0 273.0 248.0 298.0 330.0 311.0 395.0 305.0 385.0 392.0 388.0 474.0 405.0 451.0 415.0 379.0 407.0 303.0 487.0 316.0 575.0 325.0 552.0 300.0 478.0 284.0 406.0 294.0 423.0 219.0 433.0 123.0 ,-2171170 8 407.0 253.0 396.0 294.0 352.0 295.0 394.0 305.0 397.0 344.0 407.0 303.0 447.0 301.0 408.0 291.0 ,");
	imgGraphic intStar=new imgGraphic((int)(objRad*2), 0, 2*Math.PI, 20, colors, 0, "3 -16777216 12 409.0 147.0 381.0 225.0 385.0 293.0 248.0 298.0 327.0 324.0 394.0 317.0 405.0 451.0 426.0 382.0 418.0 305.0 552.0 300.0 477.0 276.0 409.0 283.0 ,v 20 409.0 147.0 389.0 226.0 395.0 295.0 307.0 279.0 221.0 273.0 248.0 298.0 330.0 311.0 395.0 305.0 385.0 392.0 388.0 474.0 405.0 451.0 415.0 379.0 407.0 303.0 487.0 316.0 575.0 325.0 552.0 300.0 478.0 284.0 406.0 294.0 423.0 219.0 433.0 123.0 ,-2171170 8 407.0 253.0 396.0 294.0 352.0 295.0 394.0 305.0 397.0 344.0 407.0 303.0 447.0 301.0 408.0 291.0 ,");
//	graphic ninja=new graphic("4 -16777216 43 226.0 256.0 232.0 240.0 250.0 237.0 264.0 250.0 271.0 288.0 284.0 297.0 296.0 310.0 353.0 343.0 415.0 306.0 390.0 324.0 353.0 369.0 301.0 344.0 306.0 363.0 329.0 382.0 370.0 425.0 399.0 434.0 454.0 469.0 486.0 491.0 486.0 501.0 480.0 510.0 446.0 482.0 381.0 462.0 371.0 454.0 342.0 447.0 304.0 417.0 215.0 422.0 224.0 482.0 228.0 491.0 225.0 498.0 171.0 498.0 165.0 488.0 206.0 481.0 187.0 424.0 184.0 406.0 188.0 397.0 200.0 391.0 260.0 382.0 239.0 335.0 235.0 312.0 156.0 238.0 171.0 242.0 177.0 235.0 232.0 279.0 ,-12698050 66 225.0 256.0 231.0 240.0 249.0 237.0 263.0 250.0 256.0 261.0 238.0 270.0 241.0 277.0 262.0 271.0 261.0 286.0 252.0 294.0 237.0 286.0 244.0 312.0 262.0 303.0 272.0 292.0 295.0 310.0 352.0 343.0 381.0 313.0 379.0 297.0 384.0 289.0 387.0 302.0 406.0 281.0 414.0 306.0 398.0 322.0 387.0 328.0 351.0 362.0 283.0 332.0 268.0 342.0 256.0 344.0 276.0 350.0 296.0 368.0 327.0 388.0 369.0 425.0 399.0 438.0 453.0 469.0 485.0 491.0 485.0 501.0 479.0 510.0 445.0 482.0 385.0 459.0 372.0 451.0 344.0 442.0 303.0 406.0 207.0 418.0 223.0 482.0 227.0 491.0 224.0 498.0 200.0 493.0 171.0 497.0 164.0 488.0 212.0 478.0 190.0 422.0 190.0 407.0 199.0 391.0 267.0 384.0 242.0 334.0 232.0 298.0 204.0 276.0 167.0 245.0 153.0 238.0 138.0 216.0 140.0 200.0 150.0 196.0 161.0 220.0 171.0 212.0 172.0 229.0 231.0 279.0 ,-1 3 254.0 265.0 261.0 261.0 261.0 269.0 ,-1 3 238.0 269.0 245.0 265.0 245.0 273.0 ,");
//	graphic ninja=new graphic("4 -16777216 43 476.0 341.0 482.0 325.0 500.0 322.0 514.0 335.0 521.0 373.0 534.0 382.0 546.0 395.0 603.0 428.0 665.0 391.0 640.0 409.0 603.0 454.0 551.0 429.0 556.0 448.0 579.0 467.0 620.0 510.0 649.0 519.0 704.0 554.0 736.0 576.0 736.0 586.0 730.0 595.0 696.0 567.0 631.0 547.0 621.0 539.0 592.0 532.0 554.0 502.0 465.0 507.0 474.0 567.0 478.0 576.0 475.0 583.0 421.0 583.0 415.0 573.0 456.0 566.0 437.0 509.0 434.0 491.0 438.0 482.0 450.0 476.0 510.0 467.0 489.0 420.0 485.0 397.0 406.0 323.0 421.0 327.0 427.0 320.0 482.0 364.0 ,-12698050 66 476.0 341.0 482.0 325.0 500.0 322.0 514.0 335.0 507.0 346.0 489.0 355.0 492.0 362.0 513.0 356.0 512.0 371.0 503.0 379.0 488.0 371.0 495.0 397.0 513.0 388.0 523.0 377.0 546.0 395.0 603.0 428.0 632.0 398.0 630.0 382.0 635.0 374.0 638.0 387.0 657.0 366.0 665.0 391.0 649.0 407.0 638.0 413.0 602.0 447.0 534.0 417.0 519.0 427.0 507.0 429.0 527.0 435.0 547.0 453.0 578.0 473.0 620.0 510.0 650.0 523.0 704.0 554.0 736.0 576.0 736.0 586.0 730.0 595.0 696.0 567.0 636.0 544.0 623.0 536.0 595.0 527.0 554.0 491.0 458.0 503.0 474.0 567.0 478.0 576.0 475.0 583.0 451.0 578.0 422.0 582.0 415.0 573.0 463.0 563.0 441.0 507.0 441.0 492.0 450.0 476.0 518.0 469.0 493.0 419.0 483.0 383.0 455.0 361.0 418.0 330.0 404.0 323.0 389.0 301.0 391.0 285.0 401.0 281.0 412.0 305.0 422.0 297.0 423.0 314.0 482.0 364.0 ,-1 3 504.0 350.0 511.0 346.0 511.0 354.0 ,-1 3 488.0 354.0 495.0 350.0 495.0 358.0 ,");
	graphic ninja=new graphic("4 -16777216 40 388.0 237.0 394.0 221.0 412.0 218.0 426.0 231.0 433.0 269.0 446.0 278.0 458.0 291.0 515.0 324.0 577.0 287.0 552.0 305.0 515.0 350.0 463.0 325.0 468.0 344.0 491.0 363.0 532.0 406.0 561.0 415.0 616.0 450.0 648.0 472.0 648.0 482.0 642.0 491.0 608.0 463.0 543.0 443.0 533.0 435.0 504.0 428.0 466.0 398.0 377.0 403.0 386.0 463.0 390.0 472.0 387.0 479.0 333.0 479.0 327.0 469.0 368.0 462.0 349.0 405.0 346.0 387.0 350.0 378.0 362.0 372.0 422.0 363.0 401.0 316.0 397.0 293.0 394.0 260.0 ,-12698050 57 388.0 237.0 394.0 221.0 412.0 218.0 426.0 231.0 419.0 242.0 401.0 251.0 404.0 258.0 425.0 252.0 424.0 267.0 415.0 275.0 400.0 267.0 407.0 293.0 425.0 284.0 435.0 273.0 458.0 291.0 515.0 324.0 544.0 294.0 542.0 278.0 547.0 270.0 550.0 283.0 569.0 262.0 577.0 287.0 561.0 303.0 550.0 309.0 514.0 343.0 446.0 313.0 431.0 323.0 419.0 325.0 439.0 331.0 459.0 349.0 490.0 369.0 532.0 406.0 562.0 419.0 616.0 450.0 648.0 472.0 648.0 482.0 642.0 491.0 608.0 463.0 548.0 440.0 535.0 432.0 507.0 423.0 466.0 387.0 370.0 399.0 386.0 463.0 390.0 472.0 387.0 479.0 363.0 474.0 334.0 478.0 327.0 469.0 375.0 459.0 353.0 403.0 353.0 388.0 362.0 372.0 430.0 365.0 405.0 315.0 395.0 279.0 394.0 260.0 ,-1 3 416.0 246.0 423.0 242.0 423.0 250.0 ,-1 3 400.0 250.0 407.0 246.0 407.0 254.0 ,");
	graphic arm=new graphic("2 -16777216 5 396.0 294.0 404.0 302.0 462.0 309.0 541.0 293.0 549.3072 296.87354 ,-12698050 16 394.02032 279.20056 386.0 282.0 387.0 293.0 393.0 298.0 405.3309 301.00116 449.5855 302.80795 464.15207 305.71698 523.8265 298.2961 551.0369 297.01218 556.092 277.3943 529.3786 284.82898 530.9373 276.24823 519.5862 287.52625 468.4116 285.16455 457.75412 287.79257 445.8518 284.22656 ,");
	graphic surface=new graphic("1 -4994323 15 441.1239 278.63965 451.5863 193.9888 405.93192 107.435974 417.34546 9.46936 410.6876 -155.07661 436.3682 -225.46048 438.27048 -121.78694 482.9738 -61.865982 478.21808 69.39081 534.33514 197.79312 604.71893 234.888 917.64075 265.32446 775.9226 284.34674 661.7864 277.68896 557.1624 291.00446 ,");
	graphic bomb1=new graphic("6 -9803158 8 368.0 127.0 375.0 119.0 393.0 113.0 411.0 115.0 424.0 118.0 429.0 124.0 417.0 138.0 379.0 139.0 ,-12500671 23 364.0 154.0 322.0 171.0 284.0 201.0 259.0 246.0 249.0 309.0 262.0 364.0 297.0 411.0 346.0 442.0 405.0 452.0 459.0 440.0 507.0 410.0 529.0 383.0 545.0 346.0 550.0 308.0 549.0 282.0 543.0 255.0 519.0 205.0 481.0 173.0 435.0 154.0 430.0 124.0 415.0 131.0 383.0 132.0 367.0 127.0 ,-9803158 18 271.0 347.0 262.0 299.0 267.0 249.0 279.0 225.0 292.0 207.0 313.0 189.0 336.0 174.0 354.0 168.0 368.0 166.0 388.0 172.0 411.0 170.0 397.0 194.0 363.0 207.0 335.0 229.0 312.0 256.0 289.0 299.0 285.0 337.0 296.0 393.0 ,-9803158 7 412.0 439.0 456.0 429.0 498.0 400.0 528.0 359.0 539.0 310.0 511.0 355.0 470.0 402.0 ,-1584721 5 389.0 124.0 403.0 126.0 413.0 122.0 409.0 93.0 391.0 94.0 ,-196709 12 400.0 95.0 351.0 113.0 387.0 88.0 334.0 81.0 388.0 76.0 348.0 35.0 396.0 71.0 414.0 21.0 409.0 74.0 457.0 72.0 413.0 87.0 452.0 112.0 ,");
	graphic bomb2=new graphic("6 -9803158 8 368.0 127.0 375.0 119.0 393.0 113.0 411.0 115.0 424.0 118.0 429.0 124.0 417.0 138.0 379.0 139.0 ,-12500671 23 364.0 154.0 322.0 171.0 284.0 201.0 259.0 246.0 249.0 309.0 262.0 364.0 297.0 411.0 346.0 442.0 405.0 452.0 459.0 440.0 507.0 410.0 529.0 383.0 545.0 346.0 550.0 308.0 549.0 282.0 543.0 255.0 519.0 205.0 481.0 173.0 435.0 154.0 430.0 124.0 415.0 131.0 383.0 132.0 367.0 127.0 ,-9803158 18 271.0 347.0 262.0 299.0 267.0 249.0 279.0 225.0 292.0 207.0 313.0 189.0 336.0 174.0 354.0 168.0 368.0 166.0 388.0 172.0 411.0 170.0 397.0 194.0 363.0 207.0 335.0 229.0 312.0 256.0 289.0 299.0 285.0 337.0 296.0 393.0 ,-9803158 7 412.0 439.0 456.0 429.0 498.0 400.0 528.0 359.0 539.0 310.0 511.0 355.0 470.0 402.0 ,-1584721 5 389.0 124.0 403.0 126.0 413.0 122.0 409.0 93.0 391.0 94.0 ,-196709 14 401.0 98.0 366.0 124.0 388.0 91.0 335.0 99.0 387.0 82.0 336.0 49.0 393.0 74.0 388.0 23.0 407.0 74.0 454.0 49.0 411.0 84.0 465.0 91.0 417.0 93.0 444.0 120.0 ,");
	
	obj[] obj=new obj[500];
	int index;
	
	int maxBursts=500;
	burst[] burst=new burst[maxBursts];
	int bIndex;
	
	String highscores;
	
	Color shadow=new Color(0,0,0,0.75f), ice=Color.getHSBColor(0.6f, 0.2f, 1), fontColor=Color.getHSBColor(0.6f, 0.7f, 0.5f), orange=new Color(1, 188.0f/256, 0);
	Font futura18=new Font("Futura", Font.PLAIN, 18), futura42=new Font("Futura", Font.PLAIN, 42), futura24=new Font("Futura", Font.PLAIN, 24);
	
	Image logo;
	
	String name="";
	
	long gameTimer;
	
	int bombs;
	boolean shootBomb;
	
	int[] kills;
	int killsLength=50, kIndex, newBombNum=10, sum;
	
	java.applet.AudioClip[] pop=new java.applet.AudioClip[3];
	java.applet.AudioClip explode, swoosh;
	
	public void init (){
		offscreen=createImage(width,height+extra);
		g2=(Graphics2D)offscreen.getGraphics();
		g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		setCursor(Cursor.getPredefinedCursor(0));
		addMouseMotionListener(this);
		addMouseListener(this);
		addKeyListener(this);
		try {
			logo=javax.imageio.ImageIO.read(new java.net.URL("http://www.amaxwellphoto.com/penguin-popper.png"));
			pop[0]=getAudioClip(new java.net.URL("http://www.amaxwellphoto.com/penguin/pop1.wav"));
			pop[1]=getAudioClip(new java.net.URL("http://www.amaxwellphoto.com/penguin/pop2.wav"));
			pop[2]=getAudioClip(new java.net.URL("http://www.amaxwellphoto.com/penguin/pop3.wav"));
			explode=getAudioClip(new java.net.URL("http://www.amaxwellphoto.com/penguin/explode.wav"));
			swoosh=getAudioClip(new java.net.URL("http://www.amaxwellphoto.com/penguin/swoosh.wav"));
		} catch (java.io.IOException e){}
	}
	public void getHighScores(){
		try {
			java.net.URL url=new java.net.URL("http://www.amaxwellphoto.com/highscores.php?game=penguin");
			highscores=new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.BufferedInputStream(url.openStream()))).readLine();
		} catch (Exception e) {}
	}
	public void showHighScores(){
		g2.setColor(fontColor);
		g2.setFont(futura42);
		g2.drawString("Leader Boards", (int)(width/2-stringWidth("Leader Boards")/2), (int)(5+stringHeight("Leader Boards")));
		g2.setFont(futura18);
		int margin=30, top=75, bottom=75, lines=15, spacing=(height-top-bottom)/lines, shiftDown=top+spacing, tab1=80, tab2=125, shiftLeft=margin, line=0;
		String current="", mode="time", name="", time="";
		for (int i=0; i<highscores.length(); i++){
			if (highscores.charAt(i)==' '){
				if (mode=="time"){
					time=current;
					mode="name";
				} else if (mode=="name"){
					name=current;
					mode="date";
				} else if (mode=="date"){
					long timeSince=System.currentTimeMillis()/1000-Long.parseLong(current);;
					String timeAgo;
					if (timeSince<60) timeAgo=timeSince+" seconds";
					else if (timeSince<60*60) timeAgo=Math.round(timeSince/60)+" minutes";
					else if (timeSince<60*60*24) timeAgo=Math.round(timeSince/(60*60))+" hours";
					else timeAgo=Math.round(timeSince/(60*60*24))+" days";
					g2.drawString(toTime(Integer.parseInt(time)), shiftLeft, shiftDown);
					g2.drawString(name, shiftLeft+tab1, shiftDown);
					g2.drawString(timeAgo+" ago", shiftLeft+tab1+tab2, shiftDown);
					line++;
					if (line==lines){
						shiftLeft=width/2;
						shiftDown=top+spacing;
					} else shiftDown+=spacing;
					mode="time";
				}
				current="";
			} else current+=highscores.charAt(i);
		}
		g2.setFont(futura24);
		if (button("back", width/2-stringWidth("back")/2, height-10, false)) {
			begun=false;
			viewHighScores=false;
		}
	}
	public void reset(){
		index=0;
		bIndex=0;
		moreNum=12;
		entry=0;
		entryIncrement=startingEntry;
		finished=false;
		shooting=false;
		health=maxHealth;
		gameTimer=0;
		bombs=3;
		shootBomb=false;
		kills=new int[killsLength];
		kIndex=0;
		sum=0;
		newBombTimer=0;
	}
	public double stringWidth (String x){
		return g2.getFontMetrics(g2.getFont()).getStringBounds(x, g2).getWidth();
	}
	public double stringHeight (String x){
		return g2.getFontMetrics(g2.getFont()).getStringBounds(x, g2).getHeight();
	}
	public double getAngle(double x1, double y1, double x2, double y2){
		return x2<x1 ? Math.atan((y2-y1)/(x2-x1))+3.1415926536 : Math.atan((y2-y1)/(x2-x1));
	}
	public double dist (double x1, double y1, double x2, double y2){
		return Math.sqrt((x1-x2)*(x1-x2)+(y1-y2)*(y1-y2));
	}
	public double sq (double x){
		return x*x;
	}
	public boolean button (String str, double xc, double yc, boolean cond){
		boolean over=g2.getFontMetrics(g2.getFont()).getStringBounds(str, g2).contains(mouseX-xc, mouseY-yc);
		g2.setColor(Color.black);
		g2.drawString(str, (int)xc+1, (int)yc+1);
		if (over) g2.setColor(fontColor);
		else if (cond) g2.setColor(Color.green);
		else g2.setColor(orange);
		g2.drawString(str, (int)xc, (int)yc);
		if (over && mouseDown) clickedButton=true;
		return over && mouseDown;
	}
	public void mouseMoved(MouseEvent evt){
		mouseX = evt.getX();
		mouseY = evt.getY();
	}
	public void mousePressed(MouseEvent evt) { 
		mouseDown=true;
	}
	public void keyPressed(KeyEvent evt) { 
		int key = evt.getKeyCode();
		if (key==KeyEvent.VK_SPACE && bombs>0){
			shootBomb=!shootBomb;
		}
//		else if (key==KeyEvent.VK_M){
//			for (int i=0; i<moreNum; i++){
//				obj[index++]=new obj();
//			}
//		} 
//		else if (key==KeyEvent.VK_B && bombs>0) isBomb=!isBomb;
//		else if (key==KeyEvent.VK_UP) maxFrameRate++;
//		else if (key==KeyEvent.VK_DOWN && maxFrameRate>1) maxFrameRate--;
		if (menu && !begun && !viewHighScores && !gameOverScreen){
			char c=evt.getKeyChar();
			if (c==KeyEvent.VK_BACK_SPACE && name.length()>0) name=name.substring(0, name.length()-1);
			else if (((c>64 && c<=90) || (c>96 && c<=122)) && name.length()<=12) name+=c;
		}
	}
	public void keyTyped(KeyEvent evt) { }
	public void keyReleased(KeyEvent evt) { }
	public void mouseDragged(MouseEvent evt) { 
		mouseX = evt.getX();
		mouseY = evt.getY();
	}
	public void mouseClicked(MouseEvent evt) { }
	public void mouseReleased(MouseEvent evt) { 
		mouseDown=false;
		if (clickedButton) clickedButton=false;
		else if (!finished && !menu) shooting=true;
	}
	public void mouseEntered(MouseEvent evt) { }
	public void mouseExited(MouseEvent evt) { }
	
	public class obj {
		double xc, yc, xs, ys, angle=0, newTime=0, life;
		int attr;
		boolean kill=false, dead=false, projectile=false, waddleLeft=false, isBomb=false;
		public obj (double x, double y, double xx, double yy){
			xc=x;
			yc=y;
			xs=xx;
			ys=yy;
			attr=starColor;
			projectile=true;
			life=projectileTime;
			int newColor;
			do{
				newColor=(int)(Math.random()*numColors);
			} while (newColor==starColor);
			starColor=newColor;
			if (shootBomb){
				isBomb=true;
				shootBomb=false;
				bombs--;
			} 
			if (!isBomb && sound) swoosh.play();
		}
		public obj (){
			attr=(int)(Math.random()*numColors);
			newTime=2*objRad;
			double xx, yy, rand=Math.random();
			if (rand<0.25){
				xx=-objRad;
				yy=Math.random()*height;
			} else if (rand<0.5){
				xx=width+objRad;
				yy=Math.random()*height;
			} else if (rand<0.75){
				xx=Math.random()*width;
				yy=-objRad;
			} else {
				xx=Math.random()*width;
				yy=height+objRad;
			}
			xc=xx;
			yc=yy;
		}
		public void draw(){
			if (projectile && !isBomb) intStar.draw(g2, xc, yc, angle, attr);
			else if (isBomb){
				if ((System.currentTimeMillis()/100)%2==0) bomb1.draw(g2, xc, yc, objRad, angle, false);
				else bomb2.draw(g2, xc, yc, objRad, angle, false);
			}
			else penguin.draw(g2, xc, yc, angle, attr);
		}
		public void increment(){
			xc+=xs;
			yc+=ys;
		}
		public void move (){
			if (projectile){
				angle+=spinSpeed/frameRate;
			} else {
				if (Math.abs(xs)>0.1 || Math.abs(ys)>0.1){
					if (waddleLeft){
						if (angle-waddleSpeed/frameRate<-waddleSize) {
							angle=-waddleSize;
							waddleLeft=false;
						} else angle-=waddleSpeed/frameRate;
					} else {
						if (angle+waddleSpeed/frameRate>waddleSize){
							angle=waddleSize;
							waddleLeft=true;
						} else angle+=waddleSpeed/frameRate;
					}
				} else {
					if (angle-waddleSpeed/frameRate>=0) angle-=waddleSpeed/frameRate;
					else if (angle+waddleSpeed/frameRate<=0) angle+=waddleSpeed/frameRate;
				}
				xs*=(1.0-friction/frameRate);
				ys*=(1.0-friction/frameRate);
				double ang=getAngle(gunX, gunY, xc, yc), gunDist=sq(gunX-xc)+sq(gunY-yc);
				xs+=gravity/sq(frameRate)*Math.cos(ang)/gunDist;
				ys+=gravity/sq(frameRate)*Math.sin(ang)/gunDist;
				double fix=maxSpeed/frameRate/Math.sqrt(sq(xs)+sq(ys));
				if (fix<1){
					xs*=fix;
					ys*=fix;
				}
			}
		}
		public void walls (){
			if (yc+objRad>height+newTime) {
				yc=height+newTime-objRad;
				if (newTime>0) ys-=wallRepel/frameRate;
				else ys*=-bounce;
				if (projectile) life=0;
			}
			if (yc-objRad<-newTime){
				yc=-newTime+objRad;
				if (newTime>0) ys+=wallRepel/frameRate;
				else ys*=-bounce;
				if (projectile) life=0;
			}
			if (xc+objRad>width+newTime) {
				xc=width+newTime-objRad;
				if (newTime>0) xs-=wallRepel/frameRate;
				else xs*=-bounce;
				if (projectile) life=0;
			}
			if (xc-objRad<-newTime) {
				xc=-newTime+objRad;
				if (newTime>0) xs+=wallRepel/frameRate;
				else xs*=-bounce;
				if (projectile) life=0;
			}
			if (newTime>0) newTime-=wallRepel/frameRate;
		}
		public void repel (){
			for (int i=0; i<index; i++){
				if (obj[i]!=this && !obj[i].isBomb){
					double x1=xc, y1=yc, x2=obj[i].xc, y2=obj[i].yc;
					double dist=Math.sqrt(sq(x1+xs-x2-obj[i].xs)+sq(y1+ys-y2-obj[i].ys));
					if (attr==obj[i].attr && !isBomb && (((projectile || obj[i].projectile) && dist<2*objRad) || ((kill || obj[i].kill) && dist<2.5*objRad))){
						if (!kill){
							life=killLife;
							kill=true;
						}
						if (!obj[i].kill){
							obj[i].life=killLife;
							obj[i].kill=true;
						}
					}
					if (2*objRad-dist>0 && dist>0){
						if (attr!=obj[i].attr || (!projectile && !obj[i].projectile)){
							double fix=(objRad/dist-0.5)/2;
							xs+=(x1-x2)*fix;
							ys+=(y1-y2)*fix;
							obj[i].xs+=(x2-x1)*fix;
							obj[i].ys+=(y2-y1)*fix;
							xc+=(x1-x2)*fix;
							yc+=(y1-y2)*fix;
							obj[i].xc+=(x2-x1)*fix;
							obj[i].yc+=(y2-y1)*fix;
						}
						if (isBomb) {
							if (sound) explode.play();
							for (int k=0; k<(maxBursts-bIndex)/3; k++){
								burst[bIndex++]=new burst(this);
							}
							for (int j=0; j<index; j++){
								if (!obj[j].projectile && dist(xc, yc, obj[j].xc, obj[j].yc)<blastRad){
									obj[j].dead=true;
									for (int k=0; k<(maxBursts-bIndex)/10; k++){
										burst[bIndex++]=new burst(obj[j]);
									}
									if (sound) pop[(int)(Math.random()*3)].play();
								}
							}
							dead=true;
						}
					}
				}
			}
			if (!dead && (projectile || kill)) {
				if (life<=0){
					dead=true;
					if (!isBomb && projectile && !kill) for (int i=0; i<moreNum; i++) obj[index++]=new obj();
					else if (!projectile){
						for (int i=0; i<(maxBursts-bIndex)/10; i++){
							burst[bIndex++]=new burst(this);
						}
						if (sound) pop[(int)(Math.random()*3)].play();
						kills[kIndex]++;
					}
				} else life-=killSpeed/frameRate;
			}
		}
	}
	double burstGravity=1000, burstSpeed=500, burstRad=(int)objRad/3, shrinkSpeed=1.2;
	public class burst {
		int attr;
		double xc, yc, xs, ys, rad;
		boolean fromBomb=false;
		public burst (obj b){
			xc=b.xc;
			yc=b.yc;
			attr=b.attr;
			double ang=Math.random()*2*Math.PI, sp=Math.random()*burstSpeed;
			rad=burstRad;
			if (b.isBomb){
				fromBomb=true;
				sp*=2;
			}
			xs=sp*Math.cos(ang);
			ys=sp*Math.sin(ang);
		}
		public void draw(){
			rad*=(1.0-shrinkSpeed/frameRate);
			ys+=burstGravity/frameRate;
			xc+=xs/frameRate;
			yc+=ys/frameRate;
			g2.setColor(shadow);
			g2.fillOval((int)(xc-rad+1), (int)(yc-rad+2), (int)(2*rad), (int)(2*rad));
			if (fromBomb) g2.setColor(orange);
			else g2.setColor(colors[attr]);
			g2.fillOval((int)(xc-rad), (int)(yc-rad), (int)(2*rad), (int)(2*rad));
		}
		public boolean alive(){
			return rad>0.5 && xc>0 && xc<width && yc<height && yc>0;
		}
	}
	public String toTime (int n){
		String result=(int)(n/60)+":";
		if (n%60<10) result+="0";
		return result+(int)(n%60);
	}
	public void gameOverScreen(){
		g2.setColor(shadow);
		g2.fillRect(0,0, width, height);
		g2.setColor(Color.white);
		g2.setFont(futura42);
		String s1= "You've been trampled. You dead." ,s2="Final Time: "+toTime((int)(gameTimer/1000.0))+"   Rank: "+rank;
		g2.drawString(s1, (int)(width/2-stringWidth(s1)/2), (int)height/3);
		g2.drawString(s2, (int)(width/2-stringWidth(s2)/2), (int)(height/3+stringHeight(s2)+5));
		if (button("Try Again", width/2-stringWidth("Try Again")/2, height/3*2, false)) {
			reset();
			menu=false;
			gameOverScreen=false;
		}
		if (button("Leader Boards", width/2-stringWidth("Leader Boards")/2, height/3*2+60, false)) {
			viewHighScores=true;
			gameOverScreen=false;
			getHighScores();
		}
	}
	public void mainMenu(){
		g2.drawImage(logo, width/2-logo.getWidth(null)/2, 35, null);
		String s="";
		g2.setFont(futura24);
		g2.setColor(fontColor);
		String str="How long can you survive? Defend yourself from the onslaught of penguins by hitting them with like-colored ninja stars. Press the space bar for bombs! ";
		int shiftDown=height/2+50, lineLength=400;
		for (int j=0; j<str.length(); j++){
			if (str.charAt(j)==' ' && stringWidth(s)>=lineLength){
				g2.drawString(s, width/2-(int)stringWidth(s)/2, shiftDown);
				shiftDown+=stringHeight(s)+1;
				s="";
			} else s+=str.charAt(j);
		}
		g2.drawString(s, width/2-(int)stringWidth(s)/2, shiftDown);
		shiftDown+=stringHeight(s)+1;
		if (begun){
			if (button("resume", width/2-stringWidth("resume")/2, shiftDown, false)) menu=false;
			shiftDown+=stringHeight("resume")+1;
			if (button("restart", width/2-stringWidth("restart")/2, shiftDown, false)){
				reset();
				menu=false;
			}
			shiftDown+=stringHeight("restart")+1;
			if (sound){
				if (!clickedButton && button("sound off", width/2-stringWidth("sound off")/2, shiftDown, false)) sound=false;
			} else {
				if (!clickedButton && button("sound on", width/2-stringWidth("sound on")/2, shiftDown, false)) sound=true;
			}
			shiftDown+=stringHeight("sound off");
			if (button("quit", width/2-stringWidth("quit")/2, shiftDown, false)) begun=false;
		} else {
			shiftDown+=15;
			if ((System.currentTimeMillis()/500)%2==0) g2.fillRect((int)(width/4+stringWidth("Your name: "+name)), (int)(shiftDown+3-stringHeight("Your name: "+name)+5), 2, (int)(stringHeight("Your name: "+name)));
			g2.drawString("Your name: "+name, width/4, shiftDown);
			if (name.length()>0){
				if (button("Start!", width/4*3-stringWidth("Start!"), shiftDown, false)){
					reset();
					menu=false;
					begun=true;
				}
			}
			shiftDown+=stringHeight("Your name: "+name)+15;
			if (button("View the leader boards!", width/2-stringWidth("View the leader boards!")/2, shiftDown, false)) {
				viewHighScores=true;
				getHighScores();
			}
		}
	}
	public void hud(){
		g2.setFont(futura18);
		int tab=5, spacing=15;
		if (button("pause", tab, height+extra-5, false)) menu=true;
		tab+=(int)stringWidth("pause")+spacing;
		
		g2.setColor(colors[1]);
		int ticWidth=2, ticDist=2;
		g2.drawString("HEALTH", tab, height+extra-3);
		tab+=(int)stringWidth("HEALTH")+5;
		for (int i=0; i<health; i++){
			g2.fillRect(tab+i*(ticWidth+ticDist), height+2, ticWidth, extra-4);
		}
		tab+=health*(ticWidth+ticDist)+3;
		g2.drawString(health+"%", tab, height+extra-3);

		String s="Time: "+toTime((int)(gameTimer/1000.0));
		tab=width-(int)stringWidth(s)-2*spacing-(int)stringWidth("x"+bombs)-extra/4*3;
		
		if (newBombTimer>0) newBombTimer-=0.02;
		bomb1.draw(g2, tab, height+extra/2-2*newBombTimer*height, (objRad*newBombTimer+1)*extra/5*4, Math.PI/4, false);
		tab+=extra/4*3;
		g2.setColor(Color.white);
		g2.drawString("x"+bombs, tab, height+extra-3);

		g2.drawString(s, (int)(width-stringWidth(s)-spacing), height+extra-3);
		
	}
	public void paint (Graphics g){
		long frameTimer=System.currentTimeMillis();
		g2.setColor(ice);
		g2.fillRect(0,0,width,height+extra);
		surface.draw(g2, 0, height-extra, height/2, 0, false);
		surface.draw(g2, width, extra, height/2, Math.PI, false);
		if (!menu || gameOverScreen){
			sum-=kills[kIndex];
			kills[kIndex]=0;
			for (int i=0; i<index; i++) obj[i].draw();
			for (int i=0; i<bIndex; i++) burst[i].draw();
			for (int i=0; i<index; i++) obj[i].increment();
			for (int i=0; i<index; i++) obj[i].move();
			for (int i=0; i<index; i++) obj[i].repel();
			for (int i=0; i<index; i++) obj[i].walls();
			for (int i=0; i<index; i++){
				if (obj[i].dead) {
					index--;
					obj[i]=obj[index];
					i--;
				}
			}
			for (int i=0; i<bIndex; i++){
				if (!burst[i].alive()) {
					bIndex--;
					burst[i]=burst[bIndex];
					i--;
				}
			}
			sum+=kills[kIndex];
			if (sum>newBombNum){
				bombs++;
				for (int i=0; i<killsLength; i++) kills[i]=0;
				sum=0;
				newBombTimer=0.5;
			}
			kIndex=(kIndex+1)%killsLength;
		}
		if (!menu){
			if (begun){
				if (!finished){
					ninja.draw(g2, gunX, gunY, objRad*3, 0, false);
					gunAngle=getAngle(gunX, gunY, mouseX, mouseY);
					if (shooting){
						armAngle+=armSpeed/frameRate;
						if (armAngle>=Math.PI){
							obj[index++]=new obj(gunX+objRad*1.5*Math.cos(gunAngle), gunY+objRad*1.5*Math.sin(gunAngle), shootSpeed/frameRate*Math.cos(gunAngle), shootSpeed/frameRate*Math.sin(gunAngle));
							shooting=false;
							armAngle=0;
						}
					}
					arm.draw(g2, gunX, gunY, objRad*3, armAngle+gunAngle+Math.PI, false);
					if (shootBomb){
						if ((System.currentTimeMillis()/100)%2==0) bomb1.draw(g2, gunX+objRad*1.5*Math.cos(armAngle+gunAngle+Math.PI), gunY+objRad*1.5*Math.sin(armAngle+gunAngle+Math.PI), objRad, armAngle+gunAngle, false);
						else bomb2.draw(g2, gunX+objRad*1.5*Math.cos(armAngle+gunAngle+Math.PI), gunY+objRad*1.5*Math.sin(armAngle+gunAngle+Math.PI), objRad, armAngle+gunAngle, false);
					} else star.draw(g2, gunX+objRad*1.5*Math.cos(armAngle+gunAngle+Math.PI), gunY+objRad*1.5*Math.sin(armAngle+gunAngle+Math.PI), 2*objRad, armAngle+gunAngle, false, colors[starColor]);
					for (int i=0; i<index; i++){
						if (!obj[i].projectile){
							double d=dist(gunX, gunY, obj[i].xc, obj[i].yc);
							if (d<2*objRad) health--;
						}
					}
					if (health<=0 && !finished){
						finished=true;
						try {
							java.net.URL url=new java.net.URL("http://www.amaxwellphoto.com/matchingdb.php?penguin=yes&name="+name+"&time="+(int)(gameTimer/1000.0));
							rank=Integer.parseInt(new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.BufferedInputStream(url.openStream()))).readLine());
						} catch (Exception e) {}
						gameOverScreen=true;
						menu=true;
					}
				}
			}
			while (entry>0 && !finished){
				obj[index++]=new obj();
				entry--;
			}
			entry+=entryIncrement/frameRate;
			entryIncrement+=incrementSpeed/frameRate;
		} else if (gameOverScreen) gameOverScreen();
		else if (viewHighScores) showHighScores();
		else mainMenu();
		g2.setColor(shadow);
		g2.fillRect(0, height, width, extra);
		if (!menu) hud();
		g.drawImage(offscreen,0,0,this);
		frameRate=Math.min(1000.0/Math.min(System.currentTimeMillis()-frameTimer, 100), maxFrameRate);
		if (!menu && begun) gameTimer+=(long)(1000.0/frameRate);
		try { Thread.sleep((long)Math.max(0, 1000.0/frameRate-(System.currentTimeMillis()-frameTimer))); } catch (InterruptedException e) { ; }
		repaint();
	}
	public void update(Graphics g){
		paint(g);
	}
}
